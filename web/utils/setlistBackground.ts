/**
 * セトリ画像の背景に敷く写真の加工。
 *
 * 1080x1920 の canvas を 1 枚だけ持ち回して、そこに加工済みの背景を焼く。
 * 文字は setlistImage.ts が 2D で描くので、ここは「背景を作るところ」までしか受け持たない。
 *
 * 加工は WebGL(GLSL)で行う。Canvas 2D の ctx.filter は Safari 18 未満で丸ごと効かず、
 * ストーリー画像の主な出口が iPhone である以上「ぼかしが無反応」になるのは避けたいため。
 * WebGL が無い環境では 2D に落とし、そこで ctx.filter も無ければ明るさだけ黒の被せで再現する。
 *
 * WebGL まわりの作法(フルスクリーン三角形・compile ヘルパ・コンテキスト消失の扱い)は
 * components/ShaderBackground.tsx に倣っている。
 */

export const BACKGROUND_WIDTH = 1080;
export const BACKGROUND_HEIGHT = 1920;

/** ぼかしを掛けるときの中間バッファ。半分に落としてから掛けるので、少ないタップで半径を稼げる */
const BLUR_WIDTH = BACKGROUND_WIDTH / 2;
const BLUR_HEIGHT = BACKGROUND_HEIGHT / 2;

/** 網点の格子の間隔(px)。ShaderBackground.tsx の CELL_CSS_PX と同じ狙い */
const HALFTONE_CELL = 7;

export interface BackgroundSettings {
  /** 明るさ。0.2 〜 1.6 */
  brightness: number;
  /** コントラスト。0.6 〜 1.8 */
  contrast: number;
  /** 彩度。0 = 完全モノクロ、1 = 元のまま */
  saturation: number;
  /** ぼかし半径(1080 幅基準の px)。0 〜 24 */
  blur: number;
  /** cover を 1 とした拡大率。1 〜 ZOOM_MAX */
  zoom: number;
  /** 横のずらし。画面の幅を 1 とした量(正 = 画像を右へ) */
  offsetX: number;
  /** 縦のずらし。画面の高さを 1 とした量(正 = 画像を下へ) */
  offsetY: number;
  /** 網点にする(サイトの背景と同じ作法) */
  halftone: boolean;
}

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  brightness: 0.55,
  contrast: 1.0,
  saturation: 0.15,
  blur: 0,
  // 1.00x は画面ぴったり(cover)で、短い辺の方向には 1px も動かせない。
  // 9:16 の画像だと上下左右どちらにも動かず「掴めない」ように見えるので、
  // 最初から少し余らせておく
  zoom: 1.15,
  offsetX: 0,
  offsetY: 0,
  halftone: false,
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export interface BackgroundSource {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** オブジェクト URL の解放や ImageBitmap の破棄。差し替え・クリア時に必ず呼ぶ */
  release(): void;
}

/** render() の戻り値。canvas は使い回すので、React の依存に載るようここで包み直す */
export interface BackgroundFrame {
  canvas: HTMLCanvasElement;
}

export interface BackgroundRenderer {
  render(source: BackgroundSource, settings: BackgroundSettings): BackgroundFrame | null;
  /** WebGL で描けているか */
  readonly usesWebGL: boolean;
  /** ぼかし・彩度・コントラストが実際に効くか(2D フォールバックで ctx.filter も無いと false) */
  readonly supportsFilters: boolean;
  dispose(): void;
}

/* ---------------- 画像の読み込み ---------------- */

/** スマホの写真は EXIF で回っていることがあるので、向きを直した状態で受け取る */
export async function loadImageSource(file: File): Promise<BackgroundSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // createImageBitmap が無い/失敗する環境は <img> に落とす
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('画像を読み込めませんでした'));
      element.src = url;
    });

    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/* ---------------- 位置合わせ ---------------- */

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 1080x1920 を埋める倍率(cover)に、拡大率を掛けたもの */
function drawnSize(source: BackgroundSource, zoom: number): { width: number; height: number } {
  const cover = Math.max(BACKGROUND_WIDTH / source.width, BACKGROUND_HEIGHT / source.height);
  const scale = cover * clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  return { width: source.width * scale, height: source.height * scale };
}

/**
 * ずらせる限界。画面からはみ出した分の半分までで、
 * これを超えると地の黒が覗いてしまう。
 * 単位は画面の幅・高さを 1 とした量。
 */
export function panLimits(
  source: BackgroundSource,
  zoom: number
): { x: number; y: number } {
  const drawn = drawnSize(source, zoom);
  return {
    x: Math.max(0, (drawn.width - BACKGROUND_WIDTH) / (2 * BACKGROUND_WIDTH)),
    y: Math.max(0, (drawn.height - BACKGROUND_HEIGHT) / (2 * BACKGROUND_HEIGHT)),
  };
}

/** 拡大率とずらしを、隙間が空かない範囲に収める */
export function clampBackgroundSettings(
  settings: BackgroundSettings,
  source: BackgroundSource
): BackgroundSettings {
  const zoom = clamp(settings.zoom, ZOOM_MIN, ZOOM_MAX);
  const limits = panLimits(source, zoom);

  return {
    ...settings,
    zoom,
    offsetX: clamp(settings.offsetX, -limits.x, limits.x),
    offsetY: clamp(settings.offsetY, -limits.y, limits.y),
  };
}

/** テクスチャ座標の倍率とずらし */
function coverUv(
  source: BackgroundSource,
  settings: BackgroundSettings
): { scale: [number, number]; offset: [number, number] } {
  const drawn = drawnSize(source, settings.zoom);
  const uScale = BACKGROUND_WIDTH / drawn.width;
  const vScale = BACKGROUND_HEIGHT / drawn.height;

  // 画像を右(下)へずらすほど、切り取る窓は左(上)へ動く。
  // 縦はシェーダ側で上下を反転してから引くので、横と同じ向きで書ける
  return {
    scale: [uScale, vScale],
    offset: [
      (1 - uScale) / 2 - settings.offsetX * uScale,
      (1 - vScale) / 2 - settings.offsetY * vScale,
    ],
  };
}

/* ---------------- GLSL ---------------- */

const VERTEX_SHADER = `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/* 元画像を cover で貼り、彩度・コントラスト・明るさを掛ける。
   uHalftone を立てると、輝度を点の大きさに置き換えた網点になる。 */
const SAMPLE_SHADER = `
precision mediump float;

uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uUvScale;
uniform vec2 uUvOffset;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uHalftone;
uniform float uCell;
uniform float uFlipY;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  // gl_FragCoord は下が 0、画像のテクスチャは上が 0。元画像を読むときだけ上下を合わせる。
  // (UNPACK_FLIP_Y_WEBGL は ImageBitmap を渡したとき無視される規定なので当てにできない)
  float y = uFlipY > 0.5 ? uResolution.y - gl_FragCoord.y : gl_FragCoord.y;
  vec2 uv = vec2(gl_FragCoord.x, y) / uResolution * uUvScale + uUvOffset;
  vec3 color = texture2D(uTex, uv).rgb;

  color = mix(vec3(dot(color, LUMA)), color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5;
  color = clamp(color, 0.0, 1.0);

  if (uHalftone > 0.5) {
    // 15 度傾けた格子。軸に平行だとモアレが出る
    mat2 rot = mat2(0.96593, 0.25882, -0.25882, 0.96593);
    vec2 cell = fract(rot * gl_FragCoord.xy / uCell) - 0.5;
    float density = 1.0 - dot(color, LUMA);
    float radius = 0.06 + density * 0.42;
    float ink = 1.0 - smoothstep(radius - 0.06, radius + 0.06, length(cell));
    color = vec3(ink);
  }

  gl_FragColor = vec4(clamp(color * uBrightness, 0.0, 1.0), 1.0);
}
`;

/* 分離型ガウス(5 タップ・線形サンプリング)。横と縦で 2 回通す */
const BLUR_SHADER = `
precision mediump float;

uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uDirection;
uniform float uRadius;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 step = uDirection / uResolution * uRadius;

  vec4 sum = texture2D(uTex, uv) * 0.2270270270;
  sum += (texture2D(uTex, uv + step * 1.3846153846) + texture2D(uTex, uv - step * 1.3846153846)) * 0.3162162162;
  sum += (texture2D(uTex, uv + step * 3.2307692308) + texture2D(uTex, uv - step * 3.2307692308)) * 0.0702702703;

  gl_FragColor = sum;
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** プログラムと、そこで使うユニフォームの位置。位置はリンク時に 1 度だけ引く */
interface LinkedProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function link(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: string[]
): LinkedProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // リンク後は個々のシェーダを保持しておく必要が無い
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  // getUniformLocation は GPU プロセスへの同期問い合わせなので、描画のたびに引かない。
  // ぼかしを掛けると 1 回の更新で 7 ドロー走るため、ここが効いてくる
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return { program, uniforms };
}

interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  // WebGL1 では 2 の冪でないテクスチャに REPEAT / ミップマップが使えない
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function createTarget(
  gl: WebGLRenderingContext,
  width: number,
  height: number
): RenderTarget | null {
  const texture = createTexture(gl);
  if (!texture) return null;

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) return null;

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return complete ? { framebuffer, texture } : null;
}

/* ---------------- 2D フォールバック ---------------- */

/** ctx.filter が実際に効くか。代入して読み返すのが一番確実 */
function detectFilterSupport(): boolean {
  if (typeof document === 'undefined') return false;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  ctx.filter = 'blur(1px)';
  return ctx.filter === 'blur(1px)';
}

function render2d(
  canvas: HTMLCanvasElement,
  source: BackgroundSource,
  settings: BackgroundSettings,
  withFilter: boolean
): void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  ctx.filter = 'none';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, BACKGROUND_WIDTH, BACKGROUND_HEIGHT);

  const drawn = drawnSize(source, settings.zoom);
  // ぼかすと縁が透けるので、その分だけ画面中央を軸に大きめに貼る
  const overscan = withFilter ? settings.blur * 3 : 0;
  const grow = 1 + (overscan * 2) / Math.min(BACKGROUND_WIDTH, BACKGROUND_HEIGHT);
  const drawnWidth = drawn.width * grow;
  const drawnHeight = drawn.height * grow;

  if (withFilter) {
    ctx.filter = [
      `blur(${settings.blur}px)`,
      `saturate(${Math.round(settings.saturation * 100)}%)`,
      `contrast(${settings.contrast})`,
      `brightness(${settings.brightness})`,
    ].join(' ');
  }

  ctx.drawImage(
    source.image,
    (BACKGROUND_WIDTH - drawnWidth) / 2 + settings.offsetX * BACKGROUND_WIDTH,
    (BACKGROUND_HEIGHT - drawnHeight) / 2 + settings.offsetY * BACKGROUND_HEIGHT,
    drawnWidth,
    drawnHeight
  );
  ctx.filter = 'none';

  if (!withFilter) {
    // せめて明るさだけは合わせる。黒を重ねて落とす
    const dim = Math.max(0, 1 - settings.brightness);
    if (dim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${dim})`;
      ctx.fillRect(0, 0, BACKGROUND_WIDTH, BACKGROUND_HEIGHT);
    }
  }
}

/* ---------------- レンダラ ---------------- */

/* プレビューは常に 1 枚しか無いので、WebGL コンテキストは 1 つを共有する。
   タブを行き来するたびに作り直すと、ブラウザのコンテキスト数の上限に当たる */
let sharedRenderer: BackgroundRenderer | null = null;

export function getBackgroundRenderer(): BackgroundRenderer {
  if (!sharedRenderer) sharedRenderer = createBackgroundRenderer();
  return sharedRenderer;
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // バッキングストアは 1080x1920 固定。devicePixelRatio は掛けない
  // (どの端末でも同じ PNG が出ることが要件)
  canvas.width = BACKGROUND_WIDTH;
  canvas.height = BACKGROUND_HEIGHT;
  return canvas;
}

export function createBackgroundRenderer(): BackgroundRenderer {
  const glCanvas = createCanvas();

  const gl = glCanvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    // 描いたあと別のタスクで drawImage されても中身が残るように
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  }) as WebGLRenderingContext | null;

  const filterSupport = detectFilterSupport();

  let sampleProgram: LinkedProgram | null = null;
  let blurProgram: LinkedProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let sourceTexture: WebGLTexture | null = null;
  let targets: [RenderTarget, RenderTarget] | null = null;
  let uploadedImage: CanvasImageSource | null = null;

  const setupGl = (context: WebGLRenderingContext): boolean => {
    sampleProgram = link(context, VERTEX_SHADER, SAMPLE_SHADER, [
      'uTex',
      'uResolution',
      'uUvScale',
      'uUvOffset',
      'uBrightness',
      'uContrast',
      'uSaturation',
      'uHalftone',
      'uCell',
      'uFlipY',
    ]);
    blurProgram = link(context, VERTEX_SHADER, BLUR_SHADER, [
      'uTex',
      'uResolution',
      'uDirection',
      'uRadius',
    ]);
    if (!sampleProgram || !blurProgram) return false;

    // 四角形ではなく画面を覆う三角形 1 枚。頂点が 1 つ少なく、対角の継ぎ目も出ない
    buffer = context.createBuffer();
    if (!buffer) return false;
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      context.STATIC_DRAW
    );

    for (const linked of [sampleProgram, blurProgram]) {
      const position = context.getAttribLocation(linked.program, 'aPosition');
      context.enableVertexAttribArray(position);
      context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);
    }

    const first = createTarget(context, BLUR_WIDTH, BLUR_HEIGHT);
    const second = createTarget(context, BLUR_WIDTH, BLUR_HEIGHT);
    if (!first || !second) return false;
    targets = [first, second];

    sourceTexture = createTexture(context);
    return sourceTexture !== null;
  };

  const ready = gl !== null && setupGl(gl);
  // 一度 webgl を取った canvas からは 2D コンテキストが取れないので、落ちるときは別の canvas を使う
  const canvas = ready ? glCanvas : createCanvas();

  const uploadSource = (context: WebGLRenderingContext, source: BackgroundSource): void => {
    if (uploadedImage === source.image) return;
    context.bindTexture(context.TEXTURE_2D, sourceTexture);
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA,
      context.RGBA,
      context.UNSIGNED_BYTE,
      source.image as TexImageSource
    );
    uploadedImage = source.image;
  };

  const drawSample = (
    context: WebGLRenderingContext,
    texture: WebGLTexture,
    width: number,
    height: number,
    uvScale: [number, number],
    uvOffset: [number, number],
    settings: { brightness: number; contrast: number; saturation: number; halftone: boolean },
    flipY: boolean
  ): void => {
    const { program, uniforms } = sampleProgram!;
    context.useProgram(program);
    context.viewport(0, 0, width, height);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, texture);
    context.uniform1i(uniforms.uTex, 0);
    context.uniform2f(uniforms.uResolution, width, height);
    context.uniform2f(uniforms.uUvScale, uvScale[0], uvScale[1]);
    context.uniform2f(uniforms.uUvOffset, uvOffset[0], uvOffset[1]);
    context.uniform1f(uniforms.uBrightness, settings.brightness);
    context.uniform1f(uniforms.uContrast, settings.contrast);
    context.uniform1f(uniforms.uSaturation, settings.saturation);
    context.uniform1f(uniforms.uHalftone, settings.halftone ? 1 : 0);
    context.uniform1f(uniforms.uCell, HALFTONE_CELL);
    context.uniform1f(uniforms.uFlipY, flipY ? 1 : 0);

    context.drawArrays(context.TRIANGLES, 0, 3);
  };

  const drawBlur = (
    context: WebGLRenderingContext,
    texture: WebGLTexture,
    horizontal: boolean,
    radius: number
  ): void => {
    const { program, uniforms } = blurProgram!;
    context.useProgram(program);
    context.viewport(0, 0, BLUR_WIDTH, BLUR_HEIGHT);

    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, texture);
    context.uniform1i(uniforms.uTex, 0);
    context.uniform2f(uniforms.uResolution, BLUR_WIDTH, BLUR_HEIGHT);
    context.uniform2f(uniforms.uDirection, horizontal ? 1 : 0, horizontal ? 0 : 1);
    context.uniform1f(uniforms.uRadius, radius);

    context.drawArrays(context.TRIANGLES, 0, 3);
  };

  const renderGl = (
    context: WebGLRenderingContext,
    source: BackgroundSource,
    settings: BackgroundSettings
  ): void => {
    uploadSource(context, source);
    const { scale, offset } = coverUv(source, settings);
    const identity: [number, number] = [1, 1];
    const zero: [number, number] = [0, 0];

    if (settings.blur <= 0 || !targets) {
      context.bindFramebuffer(context.FRAMEBUFFER, null);
      drawSample(
        context,
        sourceTexture!,
        BACKGROUND_WIDTH,
        BACKGROUND_HEIGHT,
        scale,
        offset,
        settings,
        true
      );
      return;
    }

    const [first, second] = targets;

    // 1) 半解像度に cover で写す(色はまだ触らない)
    context.bindFramebuffer(context.FRAMEBUFFER, first.framebuffer);
    drawSample(
      context,
      sourceTexture!,
      BLUR_WIDTH,
      BLUR_HEIGHT,
      scale,
      offset,
      { brightness: 1, contrast: 1, saturation: 1, halftone: false },
      true
    );

    // 2) 横 → 縦を必要な回数だけ往復させる。1 回で伸ばしすぎると分身が見える
    const half = settings.blur / 2;
    const iterations = half <= 4 ? 1 : half <= 9 ? 2 : 3;
    const radius = Math.max(half / (iterations * 2.4), 0.4);

    let read = first;
    let write = second;
    for (let i = 0; i < iterations; i++) {
      context.bindFramebuffer(context.FRAMEBUFFER, write.framebuffer);
      drawBlur(context, read.texture, true, radius);
      [read, write] = [write, read];

      context.bindFramebuffer(context.FRAMEBUFFER, write.framebuffer);
      drawBlur(context, read.texture, false, radius);
      [read, write] = [write, read];
    }

    // 3) 画面に戻して色を作る
    context.bindFramebuffer(context.FRAMEBUFFER, null);
    drawSample(
      context,
      read.texture,
      BACKGROUND_WIDTH,
      BACKGROUND_HEIGHT,
      identity,
      zero,
      settings,
      false
    );
  };

  return {
    usesWebGL: ready,
    supportsFilters: ready || filterSupport,

    render(source, settings) {
      if (source.width <= 0 || source.height <= 0) return null;

      if (ready && gl) {
        renderGl(gl, source, settings);
      } else {
        render2d(canvas, source, settings, filterSupport);
      }
      return { canvas };
    },

    dispose() {
      if (!gl) return;
      if (sampleProgram) gl.deleteProgram(sampleProgram.program);
      if (blurProgram) gl.deleteProgram(blurProgram.program);
      if (buffer) gl.deleteBuffer(buffer);
      if (sourceTexture) gl.deleteTexture(sourceTexture);
      if (targets) {
        for (const target of targets) {
          gl.deleteFramebuffer(target.framebuffer);
          gl.deleteTexture(target.texture);
        }
      }
      // loseContext() は呼ばない。getContext は同じ canvas に同じコンテキストを返すので、
      // ここで失わせると StrictMode / HMR の再マウントで二度と復帰しなくなる
      sampleProgram = null;
      blurProgram = null;
      buffer = null;
      sourceTexture = null;
      targets = null;
      uploadedImage = null;
    },
  };
}
