// ui.js —— 参数面板

export function buildPanel(root, state, cam, actions) {
  root.innerHTML = `
    <h1>三维层级场景 · 太阳系</h1>

    <section class="group">
      <h2>运动</h2>
      <div class="field">
        <label>公转速度<span class="val" id="v-orbit"></span></label>
        <input type="range" id="r-orbit" min="0" max="3" step="0.1">
      </div>
      <div class="field">
        <label>自转速度<span class="val" id="v-spin"></span></label>
        <input type="range" id="r-spin" min="0" max="3" step="0.1">
      </div>
      <div class="field">
        <label>轴倾角<span class="val" id="v-tilt"></span></label>
        <input type="range" id="r-tilt" min="0" max="45" step="0.5">
      </div>
      <div class="check on" id="orbits"><span>轨道线</span><i></i></div>
    </section>

    <section class="group">
      <h2>视角</h2>
      <div class="field">
        <label>视点</label>
        <div class="seg" id="vp">
          <button data-vp="free">全景</button>
          <button data-vp="earth">地面观日</button>
          <button data-vp="moon">月球观地</button>
        </div>
      </div>
      <div class="field row">
        <button id="trackball" class="wide">轨迹球</button>
        <button id="proj" class="wide"></button>
        <button id="roam" class="wide">漫游</button>
      </div>
    </section>

    <div class="legend">
      <span><b>拖动</b>旋转</span>
      <span><b>滚轮</b>缩放</span>
      <span><b>O</b>投影</span>
      <span><b>空格</b>漫游</span>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);

  // 点击面板按钮后移除焦点，避免空格键既触发按钮又触发漫游切换
  root.addEventListener('click', () => document.activeElement?.blur());

  $('#r-orbit').addEventListener('input', (e) => { state.orbitSpeed = +e.target.value; actions.onChange(); });
  $('#r-spin').addEventListener('input', (e) => { state.spinSpeed = +e.target.value; actions.onChange(); });
  $('#r-tilt').addEventListener('input', (e) => { state.tilt = +e.target.value; actions.onChange(); });
  $('#orbits').addEventListener('click', () => { state.showOrbits = !state.showOrbits; actions.onChange(); });
  $('#vp').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { cam.setViewpoint(b.dataset.vp); actions.onChange(); }
  });
  $('#trackball').addEventListener('click', () => { cam.trackball = !cam.trackball; actions.onChange(); });
  $('#proj').addEventListener('click', () => actions.onToggleProjection());
  $('#roam').addEventListener('click', () => actions.onToggleRoam());

  function sync() {
    $('#v-orbit').textContent = '×' + state.orbitSpeed.toFixed(1);
    $('#v-spin').textContent = '×' + state.spinSpeed.toFixed(1);
    $('#v-tilt').textContent = state.tilt.toFixed(1) + '°';
    $('#r-orbit').value = state.orbitSpeed;
    $('#r-spin').value = state.spinSpeed;
    $('#r-tilt').value = state.tilt;

    $('#orbits').classList.toggle('on', state.showOrbits);
    root.querySelectorAll('#vp button').forEach((b) => b.classList.toggle('on', b.dataset.vp === cam.viewpoint));
    $('#trackball').classList.toggle('on', cam.trackball);
    $('#roam').classList.toggle('on', cam.roaming);
    $('#proj').textContent = state.projection === 'perspective' ? '透视' : '正交';
  }

  return { sync };
}
