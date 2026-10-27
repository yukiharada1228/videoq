"""Check upstream server packages on the native runner; no model/GPU inference."""
import argparse
import json
from pathlib import Path
import platform
import re
import shutil
import subprocess


def run(command, timeout=60):
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT, timeout=timeout)


def image_reference(image):
    reference = image['repository'] + '@' + image['digest']
    if not re.fullmatch(r'[a-z0-9./_-]+@sha256:[a-f0-9]{64}', reference):
        raise ValueError('An immutable upstream image reference is required')
    return reference


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('values', type=Path, help='Chart values converted from YAML to JSON')
    parser.add_argument('output', type=Path)
    parser.add_argument('--architecture', required=True, choices=['amd64', 'arm64'])
    args = parser.parse_args()
    actual = {'x86_64': 'amd64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine())
    if actual != args.architecture:
        raise ValueError('The runner must execute its native architecture')
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'os': platform.system(), 'architecture': actual, 'checks': {},
              'scope': 'Native package CLI startup only; no model downloads, model quality, GPU or Metal inference.'}
    if platform.system() == 'Linux':
        values = json.loads(args.values.read_text())
        for name, image in [('llamacpp', values['llamacpp']['image']),
                            ('whispercpp', values['whispercpp']['images'][actual])]:
            reference = image_reference(image)
            run(['docker', 'pull', '--platform', 'linux/' + actual, reference], timeout=600)
            command = ['docker', 'run', '--rm', '--network', 'none', '--user', '10001:10001', '--env', 'HOME=/tmp']
            if name == 'whispercpp':
                command += ['--entrypoint', '/app/build/bin/whisper-server']
            help_text = run([*command, reference, '--help'])
            if '--host' not in help_text or '--port' not in help_text:
                raise RuntimeError(name + ' server CLI contract is missing')
            (args.output / (name + '-help.txt')).write_text(help_text)
            report['checks'][name] = {'image': reference, 'cliStartup': 'passed', 'network': 'none'}
    elif platform.system() == 'Darwin':
        report['homebrewVersions'] = run(['brew', 'list', '--versions', 'llama.cpp', 'whisper.cpp', 'ffmpeg']).strip()
        for executable in ['llama-server', 'whisper-server', 'ffmpeg']:
            path = shutil.which(executable)
            if not path:
                raise RuntimeError('Upstream package is missing ' + executable)
            text = run([path, '-version' if executable == 'ffmpeg' else '--help'])
            if executable != 'ffmpeg' and ('--host' not in text or '--port' not in text):
                raise RuntimeError(executable + ' server CLI contract is missing')
            (args.output / (executable + '-help.txt')).write_text(text)
            report['checks'][executable] = {'path': path, 'cliStartup': 'passed'}
    else:
        raise ValueError('Unsupported basic verification platform')
    (args.output / 'packages.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
