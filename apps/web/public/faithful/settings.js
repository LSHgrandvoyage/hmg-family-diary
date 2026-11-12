/* Vehicle settings: reference PNG layout, existing native services only. */
(() => {
  const svg = (path) =>
    `<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const mic = svg(
    '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-3 0h6"/>',
  );
  const book = svg(
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6m-6 4h5"/>',
  );
  const sliders = svg(
    '<path d="M3 6h12m4 0h2M3 12h3m4 0h11M3 18h9m4 0h5"/><circle cx="17" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
  );
  const phone = svg(
    '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  );
  window.DiaryVehicleRail = `    <nav class="settings-rail" aria-label="차량 메뉴">
      <strong>차곡</strong>
      <a href="CarHome.dc.html">${mic}<span>녹음</span></a>
      <a href="CarList.dc.html">${book}<span>일기</span></a>
      <a href="#">${sliders}<span>설정</span></a>
    </nav>`;
  window.CHAGOK_TEMPLATES.carsettings = `
  <div class="vehicle-settings">
    ${window.DiaryVehicleRail}
    <main class="settings-content">
      <h1>설정</h1>
      <div class="settings-columns">
        <div class="settings-column">
          <section class="settings-card settings-connection" aria-label="휴대폰 연결">
            <div class="settings-connection-heading"><span class="settings-device-icon">${phone}</span><div><h2 data-connection-title></h2><p data-connection-time></p></div></div>
            <div class="settings-actions"><button data-sync-now class="settings-primary">지금 동기화</button><button data-connection-edit></button><button data-server-import hidden>테스트 서버 설정</button></div>
            <p class="settings-feedback" data-connection-notice role="status"></p>
          </section>
          <section class="settings-card" aria-label="우리 차 정보">
            <h2 class="settings-section-title">우리 차</h2>
            <h3 data-vehicle-name></h3><p data-vehicle-summary></p><p data-vehicle-name-notice role="status"></p>
            <button data-vehicle-edit class="settings-wide">차량 정보 수정</button>
          </section>
        </div>
        <div class="settings-column">
          <section class="settings-card" aria-label="녹음 위치">
            <h2 class="settings-section-title">녹음 위치</h2>
            <h3>이야기를 시작한 곳</h3><p>녹음 시작 시점의 위치를 일기에 함께 남겨요.</p>
            <div class="settings-row"><span data-location-state></span><button data-location-edit>권한 설정</button></div>
          </section>

        </div>
      </div>
      <footer><span>차곡 차량용 앱</span><span data-settings-version></span></footer>
    </main>
  </div>`;
  let root,
    api,
    current = {};
  const set = (selector, value) => {
    const el = root?.querySelector(selector);
    if (el) el.textContent = value;
  };
  function update(state) {
    current = { ...current, ...state };
    if (!root?.isConnected) return;
    const v = current.vehicle || {};
    set(
      "[data-connection-title]",
      current.paired ? "휴대폰과 연결됨" : "휴대폰 연결",
    );
    const when = new Date(current.last_synced_at || "");
    set(
      "[data-connection-time]",
      current.paired
        ? Number.isNaN(when.getTime())
          ? "완성한 일기를 자동으로 동기화해요"
          : `마지막 동기화 · ${when.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
        : "휴대폰에서도 일기와 목소리를 함께 보관해요",
    );
    set("[data-connection-edit]", "휴대폰 연결하기");
    set(
      "[data-connection-notice]",
      current.syncing ? "동기화하고 있어요…" : current.sync_notice || "",
    );
    root.querySelector("[data-server-import]").hidden =
      !current.server_setup_available;
    root.querySelector("[data-server-import]").disabled = !!current.syncing;
    const sync = root.querySelector("[data-sync-now]");
    sync.hidden = !current.paired;
    sync.disabled = !!current.syncing;
    root.querySelector("[data-connection-edit]").disabled = !!current.syncing;
    root.querySelector("[data-connection-edit]").hidden = !!current.paired;
    set(
      "[data-vehicle-name]",
      v.nickname || v.model || "우리 차 정보를 남겨 주세요",
    );
    set(
      "[data-vehicle-summary]",
      [v.brand, v.model, v.year, v.plate].filter(Boolean).join(" · ") ||
        "별명과 차량 정보가 새로운 일기에 함께 남아요.",
    );
    set(
      "[data-location-state]",
      current.location_granted ? "위치 권한 허용됨" : "위치 권한 필요",
    );
    set("[data-vehicle-name-notice]", current.name_notice || "");
    set("[data-settings-version]", `버전 ${current.version || "—"}`);
  }
  const refresh = async () => update(await api.bridge("getSettings"));
  function field(form, title, value, maxLength = 60) {
    const label = document.createElement("label");
    label.textContent = title;
    const input = document.createElement("input");
    input.value = value || "";
    input.maxLength = maxLength;
    label.append(input);
    form.append(label);
    return input;
  }
  function editVehicle() {
    const d = api.dialog("우리 차 정보");
    api.panelClose(d);
    const form = document.createElement("form");
    form.className = "settings-profile-form";
    d.append(form);
    const vehicle = { ...current.vehicle },
      edited = new Set();
    const fields = {};
    for (const [key, label] of [
      ["nickname", "차 별명"],
      ["brand", "제조사"],
      ["model", "모델"],
      ["type", "차종"],
      ["year", "연식"],
      ["plate", "차 번호 (선택)"],
    ]) {
      fields[key] = field(
        form,
        label,
        vehicle[key],
        key === "nickname" ? 40 : 60,
      );
      if (key === "nickname") fields[key].required = true;
      fields[key].oninput = () => edited.add(key);
    }
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    d.append(status);
    let pendingLookup = false;
    const lookup = async () => {
      if (pendingLookup) return;
      pendingLookup = true;
      lookupButton.disabled = true;
      status.textContent = "차량 정보를 확인하고 있어요…";
      try {
        const result = await api.bridge("lookupVehicle");
        if (!d.isConnected) return;
        let filled = false;
        for (const key of ["brand", "model", "year"])
          if (
            !edited.has(key) &&
            !fields[key].value.trim() &&
            result.values?.[key]
          ) {
            fields[key].value = result.values[key];
            filled = true;
          }
        if (filled) vehicle.source = result.source;
        status.textContent =
          result.notice || "확인한 정보는 직접 수정할 수 있어요.";
      } catch (e) {
        if (d.isConnected) status.textContent = e.message;
      } finally {
        pendingLookup = false;
        lookupButton.disabled = false;
      }
    };
    const lookupButton = api.button(d, "차량 정보 조회", lookup);
    const note = document.createElement("p");
    note.textContent =
      "저장한 정보는 다음 녹음부터 남아요. 과거 일기는 바뀌지 않아요.";
    d.append(note);
    const save = api.button(
      d,
      "저장",
      async () => {
        if (!form.reportValidity()) return;
        Object.entries(fields).forEach(
          ([key, input]) => (vehicle[key] = input.value.trim()),
        );
        update(
          await api.bridge("saveVehicle", {
            vehicle: { ...vehicle, source: vehicle.source || "manual" },
          }),
        );
        d.close();
      },
      true,
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      save.click();
    };
    fields.nickname.focus();
    if (["brand", "model", "year"].some((key) => !fields[key].value.trim()))
      void lookup();
  }
  function editConnection() {
    if (current.paired) return;
    const d = api.dialog(
      "휴대폰 연결",
      "휴대폰의 차량 화면에서 연결 코드를 만들어 주세요.",
    );
    api.panelClose(d);
    const name = document.createElement("p");
    name.textContent = `차 별명: ${current.vehicle?.nickname || current.vehicle?.model || "우리 차"}`;
    d.append(name);
    const form = document.createElement("form");
    d.append(form);
    const code = field(form, "8자리 연결 코드", "", 8);
    code.inputMode = "numeric";
    code.pattern = "[0-9]{8}";
    code.required = true;
    const save = api.button(
      d,
      "연결하기",
      async () => {
        if (!form.reportValidity()) return;
        update(await api.bridge("pairVehicle", { code: code.value.trim() }));
        d.close();
      },
      true,
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      save.click();
    };
    const note = document.createElement("p");
    note.textContent =
      "이 차 별명으로 연결해요. 완성한 일기와 원본 음성, 사진은 자동으로 동기화돼요.";
    d.append(note);
    code.focus();
  }
  window.DiarySettings = {
    update,
    async render(element, helpers) {
      root = element;
      api = helpers;
      await refresh();
      root.querySelector("[data-server-import]").onclick = () =>
        api.bridge("importServerSettings");
      root.querySelector("[data-vehicle-edit]").onclick = editVehicle;
      root.querySelector("[data-connection-edit]").onclick = editConnection;
      const bind = (selector, fn) =>
        (root.querySelector(selector).onclick = async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          try {
            await fn();
          } catch (error) {
            api.showError(error);
          } finally {
            b.disabled = false;
          }
        });
      bind("[data-sync-now]", async () =>
        update(await api.bridge("syncSettings")),
      );
      bind("[data-location-edit]", async () =>
        update(await api.bridge("locationSettings")),
      );
    },
  };
})();
