"""Remove only the four retired pre-migration container packages."""
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
ACTIVE = tuple('videoq-' + role for role in bootstrap.ROLES) + ('videoq-onprem-whisper-vllm',)


def api(package, method='GET'):
    if package not in RETIRED + ACTIVE:
        raise ValueError('Package is outside the fixed migration allowlist')
    if method not in ('GET', 'DELETE') or (method == 'DELETE' and package not in RETIRED):
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
    if manifest.get('schemaVersion') != 3:
        raise ValueError('Cleanup requires the completed schema 3 naming migration')
    used = {image['repository'] for image in manifest['images'].values()}
    expected = {'ghcr.io/' + OWNER + '/' + name for name in ACTIVE}
    if used != expected:
        raise ValueError('Signed release must reference exactly the five retained packages')
    # Validate every retained package and every deletion target before the first DELETE.
    metadata = {}
    for name in ACTIVE + RETIRED:
        item = api(name)
        if item is None:
            if name in ACTIVE:
                raise ValueError('A retained package is missing or inaccessible')
        elif (item.get('name') != name or
              (item.get('repository') or {}).get('full_name') != REPO or
              item.get('visibility') != 'public'):
            raise ValueError('Unexpected package name, repository or visibility')
        metadata[name] = item
    return [{'package': name, 'result': 'planned' if metadata[name] else 'not-found'} for name in RETIRED]


def execute(items, output, delete=False):
    report = {'mode': 'delete' if delete else 'preview', 'retained': list(ACTIVE), 'packages': items}
    try:
        for item in items:
            if delete and item['result'] == 'planned':
                api(item['package'], 'DELETE')
                item['result'] = 'deleted'
                if api(item['package']) is not None:
                    raise RuntimeError('Deleted package is still visible')
        for name in ACTIVE:
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
    execute(plan(manifest), args.output, args.delete)


if __name__ == '__main__':
    main()
