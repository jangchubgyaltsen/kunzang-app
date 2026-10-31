const player = new Audio()

export function play(id: string) {
  player.pause()
  player.src = `./audio/${id}.m4a`
  player.currentTime = 0
  void player.play().catch(() => {})
}
