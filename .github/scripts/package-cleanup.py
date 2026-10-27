"""Remove packages retired by a verified naming migration."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

SPEC = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('package-bootstrap.py'))
bootstrap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bootstrap)
REPO = bootstrap.REPO
OWNER = REPO.split('/')[0]
RETIRED = tuple('videoq-onprem-' + role for role in ('api', 'web', 'worker', 'whisper'))
GPU = 'videoq-onprem-whisper-vllm'
ACTIVE = tuple('videoq-' + role for role in bootstrap.ROLES) + (GPU,)
RENAMED_ACTIVE = tuple('videoq-' + role for role in bootstrap.ROLES) + ('videoq-vllm',)


def api(package, method='GET', *, retire_vllm=False):
    if package not in RETIRED + ACTIVE + RENAMED_ACTIVE:
        raise ValueError('Package is outside the fixed migration allowlist')
    deletable = (GPU,) if retire_vllm else RETIRED
    if method not in ('GET', 'DELETE') or (method == 'DELETE' and package not in deletable):
        raise ValueError('Only retired packages can be deleted')
    request = urllib.request.Request(
        f'https://api.github.com/users/{OWNER}/packages/container/{package}', method=method,
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if method == 'DELETE':
                if response.status != 204:
                    raise RuntimeError('Unexpected package deletion response')
                return None
            return json.load(response)
    except urllib.error.HTTPError as error:
        if method == 'GET' and error.code == 404:
            return None
        raise RuntimeError(f'{method} {package} failed with HTTP {error.code}') from None


def plan(manifest):
    schema = manifest.get('schemaVersion')
    if type(schema) is not int or schema not in (3, 4):
        raise ValueError('Cleanup requires a completed signed schema 3 or 4 naming migration')
    active = RENAMED_ACTIVE if schema == 4 else ACTIVE
    retired = (GPU,) if schema == 4 else RETIRED
    used = {image['repository'] for image in manifest['images'].values()}
    expected = {'ghcr.io/' + OWNER + '/' + name for name in active}
    if used != expected:
        raise ValueError('Signed release must reference exactly the five retained packages')
    # Validate every retained package and every deletion target before the first DELETE.
    metadata = {}
    for name in active + retired:
        item = api(name)
        if item is None:
            if name in active:
                raise ValueError('A retained package is missing or inaccessible')
        elif (item.get('name') != name or
              (item.get('repository') or {}).get('full_name') != REPO or
              item.get('visibility') != 'public'):
            raise ValueError('Unexpected package name, repository or visibility')
        metadata[name] = item
    return [{'package': name, 'result': 'planned' if metadata[name] else 'not-found'} for name in retired]


def execute(items, output, delete=False, retire_vllm=False):
    active = RENAMED_ACTIVE if retire_vllm else ACTIVE
    retired = (GPU,) if retire_vllm else RETIRED
    if any(item['package'] not in retired for item in items):
        raise ValueError('Unexpected deletion target for the verified migration')
    report = {'mode': 'delete' if delete else 'preview', 'retained': list(active), 'packages': items}
    try:
        for item in items:
            if delete and item['result'] == 'planned':
                if retire_vllm:
                    api(item['package'], 'DELETE', retire_vllm=True)
                else:
                    api(item['package'], 'DELETE')
                item['result'] = 'deleted'
                if api(item['package']) is not None:
                    raise RuntimeError('Deleted package is still visible')
        for name in active:
            if api(name) is None:
                raise RuntimeError('Retained package disappeared')
    finally:
        bootstrap.release.write_atomic(output, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('directory', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--delete', action='store_true')
    args = parser.parse_args()
    bootstrap.publish_context(os.environ)
    if args.output.resolve() == (args.directory / 'release.json').resolve():
        raise ValueError('Report must not overwrite the signed manifest')
    bootstrap.release.verify(args.directory / 'release.json', args.source)
    manifest = bootstrap.release.validate(json.loads((args.directory / 'release.json').read_text()), args.source)
    execute(plan(manifest), args.output, args.delete, retire_vllm=manifest['schemaVersion'] == 4)


if __name__ == '__main__':
    main()
