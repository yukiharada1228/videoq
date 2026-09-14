`thumbnail.svg`はこのカタログ専用の図形です。`preview.webm`は同じ配色の320×180px、2秒、音声なしの合成動画です。外部の動画・画像を含みません。

動画の再生成（FFmpegがある環境でrepository rootから実行）：

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'color=c=0x172c66:s=320x180:r=12:d=2' -vf 'drawgrid=w=40:h=30:t=1:c=white@0.15,drawbox=x=40:y=80:w=80:h=50:color=0x4ddeac:t=fill,drawbox=x=180:y=45:w=80:h=85:color=0x72aaff:t=fill' -c:v libvpx-vp9 -b:v 0 -crf 40 -an -y apps/web/.storybook/fixtures/media/preview.webm
```

`videos.ts`は動画を同一originの絶対URLに変換し、アプリのAPI URL設定に依存させません。YouTubeの固定IDのサムネイル要求だけをMSWで捕捉し、SVGを返します。画像の読み込み成功と動画の再生・停止はVideoCardのplayで検証します。
