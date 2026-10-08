`thumbnail.svg` is a graphic created specifically for this catalog. `preview.webm` is a synthetic, silent, two-second video at 320×180px using the same colors. Neither includes external videos or images.

Regenerate the video from the repository root with FFmpeg installed:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'color=c=0x172c66:s=320x180:r=12:d=2' -vf 'drawgrid=w=40:h=30:t=1:c=white@0.15,drawbox=x=40:y=80:w=80:h=50:color=0x4ddeac:t=fill,drawbox=x=180:y=45:w=80:h=85:color=0x72aaff:t=fill' -c:v libvpx-vp9 -b:v 0 -crf 40 -an -y apps/web/.storybook/fixtures/media/preview.webm
```

`videos.ts` converts the video path to an absolute URL on the same origin, independently of the app's API URL settings. MSW intercepts only thumbnail requests for the fixed YouTube ID and returns the SVG. VideoCard's play functions verify that images load and videos play and stop.
