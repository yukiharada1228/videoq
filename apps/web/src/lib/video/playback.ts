export function seekAndPlay(element: HTMLVideoElement, seconds: number) {
  element.currentTime = seconds;
  // Browser autoplay restrictions leave the native play controls available.
  void element.play().catch(() => {});
}
