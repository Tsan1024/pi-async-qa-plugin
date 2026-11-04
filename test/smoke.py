import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import tempfile
import time
import sys

root = Path(__file__).resolve().parents[1]
pi = os.environ.get('PI_BIN') or shutil.which('pi')
if not pi:
    raise RuntimeError('Install Pi 1.5.0 or set PI_BIN to its executable')
with tempfile.TemporaryDirectory(prefix='pi-async-smoke-') as scratch:
    config = Path(scratch) / 'config'
    (config / 'extensions').mkdir(parents=True)
    shutil.copyfile(root / 'test/fixtures/offline-provider.ts', config / 'extensions/offline-provider.ts')
    env = dict(os.environ, PI_CODING_AGENT_DIR=str(config), PI_OFFLINE='1', PI_TELEMETRY='0')
    subprocess.run([pi, 'install', str(root)], cwd=scratch, env=env, check=True)
    settings = json.loads((config / 'settings.json').read_text())
    assert root in {Path(os.path.abspath(config / source)) for source in settings['packages']}, settings
    print('PASS: installed through pi install in an isolated configuration')
    args = [pi, '--mode', 'rpc', '--offline', '--no-session', '--no-skills', '--no-context-files', '--provider', 'async-offline-test', '--model', 'test']
    proc = subprocess.Popen(args, cwd=scratch, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    events = queue.Queue()
    history = []
    selected_mode = 'Async'

    def reader():
        for line in proc.stdout:
            try:
                events.put(json.loads(line))
            except json.JSONDecodeError:
                pass
    threading.Thread(target=reader, daemon=True).start()

    def send(request_id, kind, **fields):
        proc.stdin.write(json.dumps(dict(id=request_id, type=kind, **fields)) + '\n')
        proc.stdin.flush()

    def wait(predicate):
        deadline = time.monotonic() + 20
        while True:
            event = events.get(timeout=max(0.01, deadline - time.monotonic()))
            history.append(event)
            if event.get('type') == 'extension_error':
                raise RuntimeError(event)
            if event.get('type') == 'extension_ui_request' and event.get('notifyType') == 'error':
                raise RuntimeError(event.get('message'))
            if event.get('type') == 'extension_ui_request' and event.get('method') == 'select':
                assert event['options'] == ['Default', 'Async'], event
                send(event['id'], 'extension_ui_response', value=selected_mode)
            if predicate(event):
                return event

    def response(request_id):
        result = wait(lambda e: e.get('type') == 'response' and e.get('id') == request_id)
        assert result.get('success'), result
        return result.get('data')

    def notification(text):
        predicate = lambda e: e.get('type') == 'extension_ui_request' and text in e.get('message', '')
        return next((e for e in reversed(history) if predicate(e)), None) or wait(predicate)

    def call_count(request_id):
        send(request_id, 'prompt', message='/test-stats')
        response(request_id)
        event = next(e for e in reversed(history) if e.get('message', '').startswith('OFFLINE_STATS:'))
        return json.loads(event['message'].split(':', 1)[1])['sideCalls']

    try:
        send('commands', 'get_commands')
        commands = response('commands')['commands']
        assert any(c['name'] == 'mode' for c in commands)
        assert not any(c['name'] in ['ask', 'steer', 'answers', 'ask-cancel'] for c in commands)
        send('mode', 'prompt', message='/mode')
        response('mode')
        print('PASS: only /mode is exposed; mode selected from menu')

        send('main', 'prompt', message='Run main task')
        wait(lambda e: e.get('type') == 'tool_execution_start' and e.get('toolName') == 'test_hold')
        send('slow', 'prompt', message='Slow question', streamingBehavior='steer')
        response('slow')
        send('fast', 'prompt', message='Fast question', streamingBehavior='steer')
        response('fast')
        notification('OFFLINE_SIDE_ANSWER:Fast question')
        assert not any('OFFLINE_SIDE_ANSWER:Slow question' in e.get('message', '') for e in history)
        assert call_count('counts-busy') == 2
        send('state', 'get_state')
        state = response('state')
        assert state['isStreaming'] and state['pendingMessageCount'] == 0, state
        print('PASS: exactly one answer call per question; a slow answer does not block a newer question or the main task')

        widgets = [e.get('widgetLines', []) for e in history if e.get('method') == 'setWidget' and e.get('widgetKey') == 'async-dialogue']
        assert any('Waiting for model' in line and 'Slow question' in line for lines in widgets for line in lines), widgets
        print('PASS: progress displays the question, stage and elapsed time')

        send('correction', 'prompt', message='Only local testing', streamingBehavior='steer')
        response('correction')
        notification('OFFLINE_SIDE_ANSWER:Only local testing')
        send('not-steered', 'get_state')
        assert response('not-steered')['pendingMessageCount'] == 0
        assert call_count('counts-correction') == 3
        print('PASS: busy input always bypasses without semantic routing, steering or clarification')

        send('release-side', 'prompt', message='/test-release-side')
        response('release-side')
        notification('OFFLINE_SIDE_ANSWER:Slow question')
        send('release-main', 'prompt', message='/test-release')
        response('release-main')
        wait(lambda e: e.get('type') == 'agent_end')
        assert 'OFFLINE_MAIN_SAW_SIDE_RESULTS' in json.dumps(history)
        print('PASS: attributed side answers reach the main agent at its next model call')

        send('idle', 'prompt', message='Idle question')
        wait(lambda e: e.get('type') == 'agent_end')
        assert 'OFFLINE_IDLE_MAIN' in json.dumps(history)
        assert call_count('counts-idle') == 3
        print('PASS: idle input returns to the main agent even after previous side questions')

        selected_mode = 'Default'
        send('default', 'prompt', message='/mode')
        response('default')
        send('default-main', 'prompt', message='Run main task')
        wait(lambda e: e.get('type') == 'tool_execution_start' and e.get('toolName') == 'test_hold')
        send('default-steer', 'prompt', message='Only local testing', streamingBehavior='steer')
        response('default-steer')
        send('default-state', 'get_state')
        assert response('default-state')['pendingMessageCount'] == 1
        assert call_count('counts-default') == 3
        send('default-release', 'prompt', message='/test-release')
        response('default-release')
        wait(lambda e: e.get('type') == 'agent_end')
        print('PASS: Default mode preserves native busy steering; no side model calls')
    except Exception:
        print('Recent events:', json.dumps(history[-8:], ensure_ascii=False)[:6000], file=sys.stderr)
        raise
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        errors = proc.stderr.read()
        if errors:
            print(errors[:4000], file=sys.stderr)
