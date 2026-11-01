// planets.js —— 天体参数与几何生成

// 半径/距离为场景单位，周期为速度 1 时转一圈的秒数
export const BODIES = {
  sun:     { radius: 1.3, spinPeriod: 25, emissive: true, texture: 'textures/sun.jpg' },
  mercury: { radius: 0.18, distance: 2.2, orbitPeriod: 6, spinPeriod: 8, texture: 'textures/mercury.jpg' },
  venus:   { radius: 0.44, distance: 3.1, orbitPeriod: 14, spinPeriod: 30, texture: 'textures/venus.jpg' },
  earth:   { radius: 0.5, distance: 4.2, orbitPeriod: 24, spinPeriod: 3, texture: 'textures/earth.jpg' },
  moon:    { radius: 0.14, distance: 1.1, orbitPeriod: 1.9, spinPeriod: 1.9, orbitTilt: 5.1, texture: 'textures/moon.jpg' },
  mars:    { radius: 0.27, distance: 5.4, orbitPeriod: 45, spinPeriod: 3.1, texture: 'textures/mars.jpg' },
  jupiter: { radius: 0.95, distance: 8.4, orbitPeriod: 120, spinPeriod: 1.3, texture: 'textures/jupiter.jpg' },
  saturn:  { radius: 0.8, distance: 11.5, orbitPeriod: 200, spinPeriod: 1.4, texture: 'textures/saturn.jpg', ring: { inner: 1.25, outer: 2.1 } }, // ring 为半径倍数
};

// 公转行星（月球单独挂在地球下）
export const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];

export const EARTH_TILT = 23.5; // 地轴倾角默认值，面板可调

// 小行星带：火星与木星之间
export const BELT = { inner: 6.3, outer: 7.5, count: 2500, period: 90 };

// 经纬网格球体：位置、法线（即顶点方向）、UV、索引
export function createSphere(stacks = 48, slices = 64) {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (Math.PI * i) / stacks; // 0 = 北极
    const y = Math.cos(phi);
    const r = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const theta = (2 * Math.PI * j) / slices;
      const x = r * Math.sin(theta);
      const z = r * Math.cos(theta);
      positions.push(x, y, z);
      normals.push(x, y, z);
      texcoords.push(j / slices, 1 - i / stacks); // v=1 在北极
    }
  }
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j;
      const b = a + slices + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    texcoords: new Float32Array(texcoords),
    indices: new Uint16Array(indices),
  };
}

// 土星环：XZ 平面圆环，法线朝 +Y，u 沿径向采样条纹
export function createRing(inner, outer, segments = 128) {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = (2 * Math.PI * i) / segments;
    const c = Math.cos(t);
    const s = Math.sin(t);
    positions.push(c * inner, 0, s * inner, c * outer, 0, s * outer);
    normals.push(0, 1, 0, 0, 1, 0);
    texcoords.push(0, 0.5, 1, 0.5);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    texcoords: new Float32Array(texcoords),
    indices: new Uint16Array(indices),
  };
}

// 小行星带：环带内随机点，gl.POINTS 绘制
export function createAsteroidBelt(count, rMin, rMax) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * 2 * Math.PI;
    const r = rMin + Math.random() * (rMax - rMin);
    pts.push(r * Math.cos(a), (Math.random() - 0.5) * 0.3, r * Math.sin(a));
  }
  return new Float32Array(pts);
}

// XZ 平面圆环轨道线，LINE_STRIP 闭合
export function createOrbitRing(distance, segments = 128) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = (2 * Math.PI * i) / segments;
    pts.push(distance * Math.cos(t), 0, distance * Math.sin(t));
  }
  return new Float32Array(pts);
}
