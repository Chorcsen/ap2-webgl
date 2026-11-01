// main.js —— 应用入口：WebGL2 初始化、层级渲染循环
import { BODIES, PLANETS, BELT, EARTH_TILT, createSphere, createRing, createAsteroidBelt, createOrbitRing } from './planets.js';
import { createCamera } from './camera.js';
import { buildPanel } from './ui.js';

const state = {
  orbitSpeed: 1,
  spinSpeed: 1,
  tilt: EARTH_TILT,
  showOrbits: true,
  projection: 'perspective', // perspective | ortho
};

const canvas = document.getElementById('gl-canvas');
const gl = canvas.getContext('webgl2');
if (!gl) alert("WebGL 2.0 isn't available");

gl.enable(gl.DEPTH_TEST);

// 两套着色器：纹理球体 / 纯色线条
const sphereProg = initShaders(gl, 'sphere-vertex', 'sphere-fragment');
const lineProg = initShaders(gl, 'line-vertex', 'line-fragment');

const sphereLoc = {
  aPosition: gl.getAttribLocation(sphereProg, 'aPosition'),
  aNormal: gl.getAttribLocation(sphereProg, 'aNormal'),
  aTexCoord: gl.getAttribLocation(sphereProg, 'aTexCoord'),
  uModel: gl.getUniformLocation(sphereProg, 'uModel'),
  uView: gl.getUniformLocation(sphereProg, 'uView'),
  uProj: gl.getUniformLocation(sphereProg, 'uProj'),
  uEmissive: gl.getUniformLocation(sphereProg, 'uEmissive'),
  uSunPos: gl.getUniformLocation(sphereProg, 'uSunPos'),
  uTex: gl.getUniformLocation(sphereProg, 'uTex'),
};
const lineLoc = {
  aPosition: gl.getAttribLocation(lineProg, 'aPosition'),
  uModel: gl.getUniformLocation(lineProg, 'uModel'),
  uView: gl.getUniformLocation(lineProg, 'uView'),
  uProj: gl.getUniformLocation(lineProg, 'uProj'),
  uColor: gl.getUniformLocation(lineProg, 'uColor'),
  uPointSize: gl.getUniformLocation(lineProg, 'uPointSize'),
};

// 所有天体共用同一个单位球网格，大小交给模型矩阵缩放
const sphere = createSphere();
function makeBuffer(data) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buf;
}
function makeIndexBuffer(data) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buf;
}
const sphereBuf = {
  position: makeBuffer(sphere.positions),
  normal: makeBuffer(sphere.normals),
  texcoord: makeBuffer(sphere.texcoords),
};
const sphereIBO = makeIndexBuffer(sphere.indices);

// 土星环：内外径是行星半径的倍数，绘制时用模型矩阵缩放到真实尺寸
const sRing = createRing(BODIES.saturn.ring.inner, BODIES.saturn.ring.outer);
const ringBuf = {
  position: makeBuffer(sRing.positions),
  normal: makeBuffer(sRing.normals),
  texcoord: makeBuffer(sRing.texcoords),
};
const ringIBO = makeIndexBuffer(sRing.indices);

// 小行星带：火星与木星之间的随机点云
const beltBuf = makeBuffer(createAsteroidBelt(BELT.count, BELT.inner, BELT.outer));

const ORBIT_COUNT = 129; // createOrbitRing 的顶点数
const orbitBuf = {};
for (const key of PLANETS) orbitBuf[key] = makeBuffer(createOrbitRing(BODIES[key].distance));
orbitBuf.moon = makeBuffer(createOrbitRing(BODIES.moon.distance));

// 纹理：先用 1x1 白像素占位，位图加载完成后替换
function loadTexture(url) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // 图片首行在顶部，需翻转 Y 才对齐 v 轴
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  img.src = url;
  return tex;
}
const textures = {};
for (const key of Object.keys(BODIES)) textures[key] = loadTexture(BODIES[key].texture);

// 程序化环条纹贴图，卡西尼缝处压低 alpha
function createRingTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 1;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0.00, 'rgba(190,175,150,0)');
  g.addColorStop(0.10, 'rgba(190,175,150,0.55)');
  g.addColorStop(0.38, 'rgba(214,198,172,0.85)');
  g.addColorStop(0.52, 'rgba(214,198,172,0.80)');
  g.addColorStop(0.58, 'rgba(120,105,85,0.12)'); // 卡西尼缝
  g.addColorStop(0.64, 'rgba(200,185,158,0.70)');
  g.addColorStop(0.90, 'rgba(172,157,132,0.45)');
  g.addColorStop(1.00, 'rgba(172,157,132,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return tex;
}
const ringTex = createRingTexture();

// 手造绕 X 轴旋转矩阵（行主序书写，flatten 转列主序上传）
function handRotX(deg) {
  const c = Math.cos(radians(deg));
  const s = Math.sin(radians(deg));
  return mat4(
    1, 0,  0, 0,
    0, c, -s, 0,
    0, s,  c, 0,
    0, 0,  0, 1
  );
}

// 每个天体一对轨道角 / 自转角，belt 是小行星带整体转角
const angles = { belt: 0 };
for (const key of Object.keys(BODIES)) angles[key] = { orbit: 0, spin: 0 };

function drawBody(model, key) {
  gl.uniformMatrix4fv(sphereLoc.uModel, false, flatten(model));
  gl.uniform1i(sphereLoc.uEmissive, BODIES[key].emissive ? 1 : 0);
  gl.bindTexture(gl.TEXTURE_2D, textures[key]);
  gl.drawElements(gl.TRIANGLES, sphere.indices.length, gl.UNSIGNED_SHORT, 0);
}

function drawOrbitRing(buf, model, color) {
  gl.uniformMatrix4fv(lineLoc.uModel, false, flatten(model));
  gl.uniform3fv(lineLoc.uColor, color);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.vertexAttribPointer(lineLoc.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINE_STRIP, 0, ORBIT_COUNT);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  return w / h;
}

const cam = createCamera(canvas);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  cam.update(dt);

  // 角度推进：周期取自集中配置，倍率来自面板
  const adv = (period, speed) => (dt * speed * 360) / period;
  for (const key of Object.keys(BODIES)) {
    const b = BODIES[key];
    if (b.orbitPeriod) angles[key].orbit += adv(b.orbitPeriod, state.orbitSpeed);
    if (b.spinPeriod) angles[key].spin += adv(b.spinPeriod, state.spinSpeed);
  }
  angles.belt += adv(BELT.period, state.orbitSpeed);

  const aspect = resize();
  gl.clearColor(0.02, 0.02, 0.045, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const view = cam.view();
  const proj = cam.projection(state.projection, aspect);

  // 层级模型矩阵（mult(a,b)：b 先作用于顶点）
  const sr = BODIES.sun.radius;
  const mSun = mult(rotateY(angles.sun.spin), scalem(sr, sr, sr));

  const model = {};
  const orbitFrame = {}; // 各行星公转系（平移完成、未含自转与缩放），供卫星 / 环挂载
  for (const key of PLANETS) {
    const b = BODIES[key];
    const mOrbit = mult(rotateY(angles[key].orbit), translate(b.distance, 0, 0));
    orbitFrame[key] = mOrbit;
    // 地球先在自身系倾斜自转轴再挂公转系
    const mSelf = key === 'earth' ? mult(rotateZ(state.tilt), rotateY(angles[key].spin)) : rotateY(angles[key].spin);
    model[key] = mult(mOrbit, mult(mSelf, scalem(b.radius, b.radius, b.radius)));
  }

  // 月球挂地球公转系（不继承地轴倾角），轨道面用手造矩阵
  const mMoonPlane = handRotX(BODIES.moon.orbitTilt);
  const mb = BODIES.moon;
  // 自转 = 公转，潮汐锁定
  model.moon = mult(orbitFrame.earth, mult(mMoonPlane,
    mult(rotateY(angles.moon.orbit), mult(translate(mb.distance, 0, 0),
      mult(rotateY(angles.moon.spin), scalem(mb.radius, mb.radius, mb.radius))))));

  // 土星环挂公转系，不随自转
  const satR = BODIES.saturn.radius;
  model.saturnRing = mult(orbitFrame.saturn, scalem(satR, satR, satR));

  // 视点锚点：平移列即世界坐标
  cam.anchors.earth.pos = vec3(model.earth[0][3], model.earth[1][3], model.earth[2][3]);
  cam.anchors.moon.pos = vec3(model.moon[0][3], model.moon[1][3], model.moon[2][3]);

  // 小行星带 + 轨道线
  gl.useProgram(lineProg);
  gl.uniformMatrix4fv(lineLoc.uView, false, flatten(view));
  gl.uniformMatrix4fv(lineLoc.uProj, false, flatten(proj));
  gl.enableVertexAttribArray(lineLoc.aPosition);

  gl.uniform1f(lineLoc.uPointSize, 2.0);
  gl.uniformMatrix4fv(lineLoc.uModel, false, flatten(rotateY(angles.belt)));
  gl.uniform3fv(lineLoc.uColor, [0.5, 0.46, 0.4]);
  gl.bindBuffer(gl.ARRAY_BUFFER, beltBuf);
  gl.vertexAttribPointer(lineLoc.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.POINTS, 0, BELT.count);

  if (state.showOrbits) {
    gl.uniform1f(lineLoc.uPointSize, 1.0);
    for (const key of PLANETS) drawOrbitRing(orbitBuf[key], mat4(), [0.45, 0.48, 0.62]);
    drawOrbitRing(orbitBuf.moon, mult(orbitFrame.earth, mMoonPlane), [0.38, 0.4, 0.48]);
  }

  // 太阳 + 行星 + 月球
  gl.useProgram(sphereProg);
  gl.uniformMatrix4fv(sphereLoc.uView, false, flatten(view));
  gl.uniformMatrix4fv(sphereLoc.uProj, false, flatten(proj));
  gl.uniform3fv(sphereLoc.uSunPos, [0, 0, 0]);
  gl.uniform1i(sphereLoc.uTex, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf.position);
  gl.vertexAttribPointer(sphereLoc.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(sphereLoc.aPosition);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf.normal);
  gl.vertexAttribPointer(sphereLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(sphereLoc.aNormal);
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf.texcoord);
  gl.vertexAttribPointer(sphereLoc.aTexCoord, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(sphereLoc.aTexCoord);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIBO);
  drawBody(mSun, 'sun');
  for (const key of PLANETS) drawBody(model[key], key);
  drawBody(model.moon, 'moon');

  // 土星环：半透明，不写深度
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.uniformMatrix4fv(sphereLoc.uModel, false, flatten(model.saturnRing));
  // 环面法线全朝 +Y，吃不到侧向阳光，按自发光处理
  gl.uniform1i(sphereLoc.uEmissive, 1);
  gl.bindTexture(gl.TEXTURE_2D, ringTex);
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf.position);
  gl.vertexAttribPointer(sphereLoc.aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf.normal);
  gl.vertexAttribPointer(sphereLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBuf.texcoord);
  gl.vertexAttribPointer(sphereLoc.aTexCoord, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ringIBO);
  gl.drawElements(gl.TRIANGLES, sRing.indices.length, gl.UNSIGNED_SHORT, 0);
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  requestAnimationFrame(frame);
}

function toggleProjection() {
  state.projection = state.projection === 'perspective' ? 'ortho' : 'perspective';
  panel.sync();
}
function toggleRoam() {
  cam.toggleRoam();
  panel.sync();
}

// O 切换投影，空格 暂停 / 继续漫游
window.addEventListener('keydown', (e) => {
  if (e.key === 'o' || e.key === 'O') {
    toggleProjection();
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault(); // 防止页面滚动
    toggleRoam();
  }
});

const panel = buildPanel(document.getElementById('panel'), state, cam, {
  onChange: () => panel.sync(),
  onToggleProjection: toggleProjection,
  onToggleRoam: toggleRoam,
});

panel.sync();
requestAnimationFrame((t) => { last = t; frame(t); });
