'use client'

import { useEffect, useRef } from 'react'

const VERTEX_SHADER = `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

// 白黒のハーフトーン。fbm の濃度場をドット径に写すだけで、色は一切持たない。
// 本文の可読性が最優先なので、出力輝度は MAX_LUM で頭打ちにし、
// さらに中央（本文が載る帯）へ向けて濃度自体を落としてある。
const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uCell;
/** カーソル位置。uv と同じ座標系（画面高さで正規化、中央が原点） */
uniform vec2 uMouse;

/** 地の模様が出しうる最大輝度。これ以上は明るくならない */
const float MAX_LUM = 0.17;
/** カーソルの真下だけ上乗せできる輝度。MAX_LUM との和が全体の上限になる */
const float CURSOR_LUM = 0.13;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;

  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec2(37.0, 17.0);
    amp *= 0.5;
  }

  // 振幅の総和 0.9375 で割って [0,1] に戻す
  return sum / 0.9375;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uResolution) / uResolution.y;

  float t = uTime * 0.04;

  // 濃度場：fbm 自身で UV を歪ませて、渦を巻きながらゆっくり流す。
  // カーソルは模様全体をずらす（視差）。uv は画面の高さで正規化してあり縦の可動域が
  // 横より狭いので、同じ係数だと上下だけ動きが乏しくなる。縦を強めに取る
  vec2 q = uv * 1.5 + uMouse * vec2(0.12, 0.5);
  vec2 warp = vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(5.2, 1.3) - vec2(t, 0.0)));
  float field = fbm(q + warp * 1.2 + vec2(t * 0.5, -t * 0.3));

  // カーソルの周りだけ濃度を持ち上げて、点がふくらむ。
  // 縦に伸ばした楕円にすると、上下に振ったとき明るい領域がしっかり付いてくる
  vec2 toMouse = uv - uMouse;
  vec2 haloAxes = toMouse * vec2(1.0, 0.65);
  float halo = exp(-dot(haloAxes, haloAxes) * 2.0);

  // 画面中央をわずかに沈める。本文カラムを守るのは CSS 側の .bg-veil の役目なので、
  // ここで強く落とすと縦長の画面で中央に横帯が出てしまう
  float center = smoothstep(0.0, 0.8, length(uv * vec2(0.65, 1.0)));
  field *= 0.72 + 0.28 * center;

  field = smoothstep(0.2, 0.72, field + halo * 0.45);

  // ハーフトーン格子。15 度傾けて軸沿いのモアレを避ける
  mat2 rot = mat2(0.96593, 0.25882, -0.25882, 0.96593);
  // 格子をカーソルから押しのける。押しのけ量が場所によって変わるぶん間隔が伸び縮みし、
  // レンズを乗せたように見える。位相を平行移動しただけでは何も起きないのでこれが要る
  vec2 push = toMouse * halo * 0.55 * uResolution.y;
  vec2 g = fract(rot * (frag + push) / uCell) - 0.5;

  // 最小径を残すと、薄い場所でも紙の目のような下地が残る
  float radius = 0.05 + field * 0.4;
  float ink = 1.0 - smoothstep(radius - 0.05, radius + 0.05, length(g));

  gl_FragColor = vec4(vec3(ink * (MAX_LUM + halo * CURSOR_LUM)), 1.0);
}
`

/** ハーフトーン格子の間隔（CSS ピクセル）。DPR が変わっても見た目の粗さを保つ */
const CELL_CSS_PX = 9
/** 30fps 相当。元の動きが遅いので落としても分からず、その分ファンが回らない */
const FRAME_INTERVAL_MS = 1000 / 30
const MAX_PIXEL_RATIO = 2
/** カーソル追従の緩さ。30fps でおよそ 0.2 秒かけて追いつく */
const POINTER_EASING = 0.15

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }

  return shader
}

function link(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  // プログラムにアタッチ済みなら、シェーダー本体はもう保持しなくてよい
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  return program
}

/**
 * 背景に敷く WebGL ハーフトーン。melocil.de-site の同名コンポーネントの写しで、
 * melocil.de/cue-parser として並んだときに地の模様が繋がるようにしてある。
 * 手を入れるときは melocil.de-site/components/ShaderBackground.tsx と揃える。
 * WebGL が使えない環境では単に何も描かず、body の黒地がそのまま出る。
 */
export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const start = performance.now()

    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let uResolution: WebGLUniformLocation | null = null
    let uTime: WebGLUniformLocation | null = null
    let uCell: WebGLUniformLocation | null = null
    let uMouse: WebGLUniformLocation | null = null
    let frame = 0
    let lastDrawnAt = 0

    // カーソルは uv と同じ座標系で持つ。target を毎フレーム少しずつ追いかけるので、
    // ポインタが止まってもしばらく余韻が残る
    const pointer = { x: 0, y: 0 }
    const pointerTarget = { x: 0, y: 0 }

    // コンテキストロストからの復帰でも同じ手順を踏むので関数に切ってある
    function setup(): boolean {
      program = link(gl!)
      if (!program) return false

      buffer = gl!.createBuffer()
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer)
      // 画面を覆う三角形 1 枚。四角形より頂点が 1 つ少なく、対角の継ぎ目も出ない
      gl!.bufferData(
        gl!.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl!.STATIC_DRAW,
      )

      const aPosition = gl!.getAttribLocation(program, 'aPosition')
      gl!.enableVertexAttribArray(aPosition)
      gl!.vertexAttribPointer(aPosition, 2, gl!.FLOAT, false, 0, 0)

      uResolution = gl!.getUniformLocation(program, 'uResolution')
      uTime = gl!.getUniformLocation(program, 'uTime')
      uCell = gl!.getUniformLocation(program, 'uCell')
      uMouse = gl!.getUniformLocation(program, 'uMouse')

      gl!.useProgram(program)
      return true
    }

    function draw(elapsedMs: number) {
      if (!program) return

      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      const width = Math.max(1, Math.round(canvas!.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas!.clientHeight * ratio))

      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width
        canvas!.height = height
        gl!.viewport(0, 0, width, height)
      }

      pointer.x += (pointerTarget.x - pointer.x) * POINTER_EASING
      pointer.y += (pointerTarget.y - pointer.y) * POINTER_EASING

      gl!.uniform2f(uResolution, width, height)
      gl!.uniform1f(uTime, elapsedMs / 1000)
      gl!.uniform1f(uCell, CELL_CSS_PX * ratio)
      gl!.uniform2f(uMouse, pointer.x, pointer.y)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop)
      if (now - lastDrawnAt < FRAME_INTERVAL_MS) return

      lastDrawnAt = now
      draw(now - start)
    }

    function stop() {
      if (!frame) return
      cancelAnimationFrame(frame)
      frame = 0
    }

    function play() {
      if (frame || document.hidden || !program) return

      // モーションを嫌う設定なら 1 枚だけ描いてループを回さない
      if (reduceMotion.matches) {
        draw(0)
        return
      }

      lastDrawnAt = 0
      frame = requestAnimationFrame(loop)
    }

    function onResize() {
      if (frame) return
      draw(reduceMotion.matches ? 0 : performance.now() - start)
    }

    // 位置を控えるだけ。描くのは rAF ループの仕事なので、ここでは何も描かない
    function onPointerMove(event: PointerEvent) {
      const height = canvas!.clientHeight
      if (!height) return

      pointerTarget.x = (event.clientX - canvas!.clientWidth / 2) / height
      pointerTarget.y = (height / 2 - event.clientY) / height
    }

    // 窓の外へ出たら中央へ戻す
    function onPointerOut(event: PointerEvent) {
      if (event.relatedTarget) return
      pointerTarget.x = 0
      pointerTarget.y = 0
    }

    // 途中で設定が変わったら、走っているループを畳んでから入り直す
    function onMotionChange() {
      stop()
      play()
    }

    function onVisibilityChange() {
      if (document.hidden) stop()
      else play()
    }

    function onContextLost(event: Event) {
      // preventDefault しないと webglcontextrestored が飛んでこない
      event.preventDefault()
      stop()
      program = null
    }

    function onContextRestored() {
      if (setup()) play()
    }

    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    if (!setup()) {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      return
    }

    // window の resize ではなくこちらを見るのは、モバイルのアドレスバー伸縮を拾うため
    const observer = new ResizeObserver(onResize)
    observer.observe(canvas)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut, { passive: true })
    reduceMotion.addEventListener('change', onMotionChange)

    play()

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
      reduceMotion.removeEventListener('change', onMotionChange)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)

      gl.deleteProgram(program)
      gl.deleteBuffer(buffer)
      // ここで loseContext() は呼ばない。getContext は同じ canvas に対して同じ
      // コンテキストを返すので、失わせると開発時の再マウントで二度と復帰しない
    }
  }, [])

  return <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />
}
