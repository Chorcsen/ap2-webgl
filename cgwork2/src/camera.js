// camera.js —— 轨道相机：拖拽、缩放、漫游、轨迹球、食视点

const FOVY = 45; // 正交也按它换算视野高度

// 漫游路径关键帧（方位角 0→360 单调，方便任意角度接续）
const ROAM_KEYS = [
  { az: 0, el: 20, dist: 24 },
  { az: 90, el: 38, dist: 16 },
  { az: 180, el: 14, dist: 28 },
  { az: 270, el: 42, dist: 18 },
  { az: 360, el: 20, dist: 24 },
];
const ROAM_SECONDS = 24; // 走一圈的时间
const BLEND_SECONDS = 1.2; // 从手动视角切回路径的过渡时间

const smooth = (f) => f * f * (3 - 2 * f); // smoothstep

function pathAt(t) {
  const seg = (t / ROAM_SECONDS) * (ROAM_KEYS.length - 1);
  const i = Math.min(ROAM_KEYS.length - 2, Math.floor(seg));
  const s = smooth(seg - i);
  const a = ROAM_KEYS[i];
  const b = ROAM_KEYS[i + 1];
  return {
    az: a.az + (b.az - a.az) * s,
    el: a.el + (b.el - a.el) * s,
    dist: a.dist + (b.dist - a.dist) * s,
  };
}

// 屏幕点投影到半球面，球外落到边缘圆
function trackballPoint(x, y, w, h) {
  const s = Math.min(w, h);
  const vx = (2 * x - w) / s;
  const vy = (h - 2 * y) / s; // 屏幕 y 向下，翻成向上
  const d = vx * vx + vy * vy;
  const z = d <= 1 ? Math.sqrt(1 - d) : 0;
  return normalize([vx, vy, z]);
}

export function createCamera(canvas) {
  const cam = {
    az: 35,
    el: 26,
    dist: 24,
    up: vec3(0, 1, 0), // 轨迹球的滚转留在 up
    trackball: false,
    viewpoint: 'free', // free | earth | moon
    anchors: { earth: { pos: vec3(4.2, 0, 0), radius: 0.5 }, moon: { pos: vec3(5.3, 0, 0), radius: 0.14 } },
    roaming: false, // 默认静态视角，空格或面板按钮开启漫游
    roamT: 0,
    blend: 0,
    manual: null, // 回漫游时的手动视角，用于平滑过渡
  };

  const eyeOf = () => {
    const az = radians(cam.az);
    const el = radians(cam.el);
    return vec3(
      cam.dist * Math.cos(el) * Math.sin(az),
      cam.dist * Math.sin(el),
      cam.dist * Math.cos(el) * Math.cos(az)
    );
  };

  // 左键旋转，滚轮缩放；手动输入立即接管漫游
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let tbPrev = null;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    const r = canvas.getBoundingClientRect();
    tbPrev = trackballPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    cam.roaming = false;
    if (cam.trackball) {
      // 前后球面向量定轴定角，绕轴同时转视线与 up
      const r = canvas.getBoundingClientRect();
      const cur = trackballPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      const axisCam = cross(tbPrev, cur);
      const len = length(axisCam);
      if (len > 1e-6) {
        const eye = eyeOf();
        // 轴从相机系（右/上/指向相机）变换到世界系
        const toward = normalize(eye);
        const right = normalize(cross(cam.up, toward));
        const up = cross(toward, right);
        const axis = [
          right[0] * axisCam[0] + up[0] * axisCam[1] + toward[0] * axisCam[2],
          right[1] * axisCam[0] + up[1] * axisCam[1] + toward[1] * axisCam[2],
          right[2] * axisCam[0] + up[2] * axisCam[1] + toward[2] * axisCam[2],
        ];
        const angle = (Math.asin(Math.min(1, len)) * 180) / Math.PI;
        const m = rotate(angle, axis);
        const e4 = mult(m, vec4(eye[0], eye[1], eye[2], 0));
        const u4 = mult(m, vec4(cam.up[0], cam.up[1], cam.up[2], 0));
        // 反解 az/el 存回，滚转留在 up
        cam.az = (Math.atan2(e4[0], e4[2]) * 180) / Math.PI;
        cam.el = (Math.asin(Math.min(1, Math.max(-1, e4[1] / cam.dist))) * 180) / Math.PI;
        cam.up = normalize([u4[0], u4[1], u4[2]]);
      }
      tbPrev = cur;
    } else {
      cam.az += (e.clientX - lastX) * 0.35;
      cam.el = Math.min(89, Math.max(-89, cam.el + (e.clientY - lastY) * 0.35));
      cam.up = vec3(0, 1, 0);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist = Math.min(60, Math.max(2.5, cam.dist * Math.exp(e.deltaY * 0.001)));
    cam.roaming = false;
  }, { passive: false });

  cam.setViewpoint = (vp) => {
    cam.viewpoint = vp;
    if (vp !== 'free') cam.roaming = false;
  };

  cam.toggleRoam = () => {
    cam.roaming = !cam.roaming;
    if (cam.roaming) {
      cam.viewpoint = 'free';
      cam.up = vec3(0, 1, 0);
      cam.manual = { az: cam.az, el: cam.el, dist: cam.dist };
      cam.blend = BLEND_SECONDS;
      // 方位角沿路径单调，直接反推接续点，避免跳回起点
      cam.roamT = ((((cam.az % 360) + 360) % 360) / 360) * ROAM_SECONDS;
    }
  };

  cam.update = (dt) => {
    if (!cam.roaming) return;
    cam.roamT = (cam.roamT + dt) % ROAM_SECONDS;
    const p = pathAt(cam.roamT);
    if (cam.blend > 0) {
      cam.blend = Math.max(0, cam.blend - dt);
      const s = smooth(1 - cam.blend / BLEND_SECONDS);
      cam.az = cam.manual.az + (p.az - cam.manual.az) * s;
      cam.el = cam.manual.el + (p.el - cam.manual.el) * s;
      cam.dist = cam.manual.dist + (p.dist - cam.manual.dist) * s;
    } else {
      cam.az = p.az;
      cam.el = p.el;
      cam.dist = p.dist;
    }
  };

  cam.view = () => {
    // 食视点：贴在向阳 / 向地表面上方一点，靠几何遮挡形成食
    if (cam.viewpoint === 'earth') {
      const a = cam.anchors.earth;
      const dirSun = normalize(negate(a.pos));
      return lookAt(add(a.pos, scale(a.radius * 0.96, dirSun)), vec3(0, 0, 0), vec3(0, 1, 0));
    }
    if (cam.viewpoint === 'moon') {
      const a = cam.anchors.moon;
      const dirEarth = normalize(subtract(cam.anchors.earth.pos, a.pos));
      return lookAt(add(a.pos, scale(a.radius * 0.96, dirEarth)), cam.anchors.earth.pos, vec3(0, 1, 0));
    }
    return lookAt(eyeOf(), vec3(0, 0, 0), cam.up);
  };

  // 正交视野高度按距离换算，切换投影时画面大小一致
  cam.projection = (mode, aspect) => {
    const h = Math.tan(radians(FOVY / 2)) * cam.dist;
    if (mode === 'ortho') return ortho(-h * aspect, h * aspect, -h, h, 0.1, 100);
    return perspective(FOVY, aspect, 0.1, 100);
  };

  return cam;
}
