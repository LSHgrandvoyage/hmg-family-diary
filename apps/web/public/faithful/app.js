/* The visual DOM is the user's original artifact. Only data and event bindings live here. */
(() => {
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const reference = params.get("reference") === "1";
  const native = !!window.NativeDiary;
  const C = (el) => Array.from(el.children);
  const text = (el, value) => {
    if (el) el.textContent = value ?? "";
  };
  const tail = (el, value) => {
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .forEach((n) => n.remove());
    el.append(document.createTextNode(value));
  };
  const clone = (el) => el.cloneNode(true);
  const action = (el, fn) => {
    if (!el) return;
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      Promise.resolve().then(fn).catch(showError);
    };
  };
  const touch = (el, fn, label) => {
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    if (label) el.setAttribute("aria-label", label);
    action(el, fn);
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    };
  };
  const date = (value, opts) =>
    new Date(value).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      ...opts,
    });
  const stamp = (seconds) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const minutes = (m) =>
    `${Math.max(1, Math.ceil(m.snapshot.duration_ms / 60000))}분`;
  const draft = (m) => {
    try {
      return JSON.parse(m.snapshot.draft);
    } catch {
      return { groups: [] };
    }
  };
  const title = (m) =>
    draft(m).groups[0]?.label || "아직 글로 옮기지 않은 이야기";
  const paragraphs = (m) =>
    draft(m).groups.flatMap((g) => g.statements.map((s) => s.text));
  const quote = (m) =>
    (m.snapshot.text || "").match(/[^.!?。！？]+[.!?。！？]?/)?.[0]?.trim() ||
    "";
  let page = "main",
    selected = null,
    record = null,
    items = [],
    vehicleState = {},
    query = "",
    vehicleFilter = "",
    monthOffset = 0,
    generation = 0;
  let audio = new Audio(),
    mediaUrl = null,
    mediaId = null,
    mediaWave = [],
    playbackEpoch = 0,
    pending = new Map(),
    requestId = 0;
  window.NativeReply = (id, result) => {
    const callback = pending.get(id);
    if (!callback) return;
    pending.delete(id);
    result.error
      ? callback.reject(Error(result.error))
      : callback.resolve(result);
  };
  function bridge(cmd, data = {}) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      window.NativeDiary.invoke(JSON.stringify({ id, cmd, ...data }));
      setTimeout(
        () => {
          if (pending.delete(id))
            reject(Error("응답이 늦어지고 있어요. 다시 시도해 주세요."));
        },
        cmd === "createDiary"
          ? 120000
          : ["delete", "removePhoto", "pairVehicle", "syncSettings"].includes(
                cmd,
              )
            ? 60000
            : 15000,
      );
    });
  }
  async function api(path, method = "GET", data, options = {}) {
    const r = await fetch("/api/v1/" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
      headers:
        data instanceof File
          ? { "idempotency-key": crypto.randomUUID() }
          : { "content-type": "application/json" },
      body:
        data === undefined
          ? undefined
          : data instanceof File
            ? data
            : JSON.stringify(data),
    });
    if (r.status === 401) {
      location.assign("/login");
      throw Error("로그인이 필요해요.");
    }
    const b = await r.json().catch(() => ({}));
    if (!r.ok)
      throw Error(
        {
          PAIRING_BUSY:
            "연결 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
          RATE_LIMITED: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
          PHOTO_LIMIT: "사진은 8장까지 추가할 수 있어요.",
          INVALID_PHOTO:
            "사진을 읽을 수 없거나 해상도가 너무 커요. JPG·PNG·WebP 형식, 4천만 화소 이하의 사진을 선택해 주세요.",
          TOO_LARGE: "선택한 파일이 허용 용량을 넘었어요.",
          REVISION_CONFLICT: "기록이 변경됐어요. 다시 열어 주세요.",
          INVALID_DEVICE_LABEL: "차 별명을 1~40자로 입력해 주세요.",
        }[b.error?.code] ||
          b.error?.message ||
          "처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
      );
    return b;
  }
  function dialog(title, description = "") {
    const d = document.createElement("dialog");
    const h = document.createElement("h2");
    text(h, title);
    d.append(h);
    if (description) {
      const p = document.createElement("p");
      text(p, description);
      d.append(p);
    }
    document.body.append(d);
    d.addEventListener("close", () => d.remove());
    d.showModal();
    return d;
  }
  function panelClose(d) {
    const h = d.querySelector("h2");
    const header = document.createElement("header");
    header.className = "panel-header";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "panel-close";
    close.setAttribute("aria-label", `${h.textContent} 닫기`);
    close.innerHTML =
      '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    action(close, () => d.close());
    h.replaceWith(header);
    header.append(h, close);
  }
  function button(d, label, fn, primary = false) {
    const b = document.createElement("button");
    text(b, label);
    if (primary) b.className = "primary";
    action(b, async () => {
      b.disabled = true;
      try {
        await fn(d, b);
      } finally {
        b.disabled = false;
      }
    });
    d.append(b);
    return b;
  }
  function showError(e) {
    const d = dialog("확인해 주세요", e.message || String(e));
    button(d, "확인", () => d.close());
  }
  window.nativeMessage = (message) => showError(Error(message));
  function go(next, id = selected) {
    if (reviewSubmitting) {
      showError(Error("일기를 만드는 중이에요. 잠시 기다려 주세요."));
      return;
    }
    if (native && page === "recording" && next !== "recording") return;
    pauseAudio();
    selected = id;
    const target = "#" + next + (id ? "?id=" + encodeURIComponent(id) : "");
    if (location.hash === target) void render();
    else location.hash = target;
  }
  function viewport() {
    if (!app.firstElementChild) return;
    const car = page.startsWith("car") || page === "recording";
    document.body.classList.toggle("vehicle", car);
    document.documentElement.style.background = "var(--bg)";
    document.documentElement.style.overflow = car ? "hidden" : "";
    document.body.classList.toggle("reference", reference);
    if (car) {
      const scale = reference
        ? 1
        : Math.min(
            document.documentElement.clientWidth / 1280,
            innerHeight / 720,
          );
      const designWidth = reference ? 1280 : document.documentElement.clientWidth / scale;
      const designHeight = reference ? 720 : innerHeight / scale;
      app.style.setProperty("--vehicle-width", `${designWidth}px`);
      app.style.setProperty("--vehicle-height", `${designHeight}px`);
      app.style.width = `${designWidth}px`;
      app.style.transform = `scale(${scale})`;
      app.style.margin = "0";
    } else {
      app.style.width = "";
      app.style.transform = "";
      app.style.margin = "auto";
      if (!reference && page !== "detail")
        app.firstElementChild.style.height = Math.max(660, innerHeight) + "px";
    }
  }
  window.addEventListener("resize", viewport);
  function nav(root) {
    root.querySelectorAll("a[href]").forEach((a) => {
      const target = {
        "Main.dc.html": "main",
        "Connect.dc.html": "connect",
        "Detail.dc.html": "detail",
        "Transcript.dc.html": "transcript",
        "CarHome.dc.html": "carhome",
        "CarRecording.dc.html": "recording",
        "CarList.dc.html": "carlist",
        "CarDetail.dc.html": "cardetail",
      }[a.getAttribute("href")];
      if (target)
        action(a, () => (target === "recording" ? start() : go(target)));
      else action(a, () => (native ? bridge("settings") : family()));
    });
  }
  async function family() {
    const d = dialog(
      "가족",
      "이 계정의 가족 보관함에 연결된 차량과 휴대폰이 같은 일기를 함께 봐요.",
    );
    panelClose(d);
    button(d, "로그아웃", async () => {
      const r = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw Error("로그아웃하지 못했어요.");
      location.assign("/login");
    });
  }
  function loadPhoto(container, img, src) {
    container.classList.add("photo-frame");
    const status = document.createElement("span");
    status.className = "photo-loading";
    status.setAttribute("role", "status");
    const spinner = document.createElement("span");
    spinner.className = "photo-spinner";
    spinner.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    status.append(spinner, label);
    container.append(img, status);
    let timer;
    const fail = () => {
      clearTimeout(timer);
      container.dataset.photoState = "error";
      container.setAttribute("aria-busy", "false");
      spinner.hidden = true;
      text(label, "사진을 불러오지 못했어요. 눌러서 다시 시도");
    };
    img.onload = () => {
      clearTimeout(timer);
      container.dataset.photoState = "ready";
      container.setAttribute("aria-busy", "false");
      status.hidden = true;
    };
    img.onerror = fail;
    const retry = () => {
      clearTimeout(timer);
      container.dataset.photoState = "loading";
      container.setAttribute("aria-busy", "true");
      status.hidden = false;
      spinner.hidden = false;
      text(label, "사진 불러오는 중…");
      timer = setTimeout(() => {
        if (container.isConnected) fail();
      }, 20000);
      img.removeAttribute("src");
      img.src = src;
    };
    retry();
    return retry;
  }
  function fillPhoto(el, m, p, index) {
    el.replaceChildren();
    if (p) {
      const img = new Image();
      img.alt = `사진 ${index + 1}`;
      img.className = "photo-image";
      const retry = loadPhoto(
        el,
        img,
        p.url || `/api/v1/sessions/${m.id}/photos/${p.id}`,
      );
      touch(
        el,
        () => (el.dataset.photoState === "error" ? retry() : photos(m, index)),
        `사진 ${index + 1} 크게 보기`,
      );
    } else {
      text(el, "사진이 없어요");
    }
  }
  const dotsSvg =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
  function iconButton(label, markup, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon-button";
    b.setAttribute("aria-label", label);
    b.innerHTML = markup;
    action(b, fn);
    return b;
  }
  function photos(m, index = 0) {
    if (!m.photos.length) return;
    const d = document.createElement("dialog");
    d.className = "photo-viewer";
    d.setAttribute("aria-label", "사진 크게 보기");
    const header = document.createElement("header"),
      count = document.createElement("span"),
      track = document.createElement("div"),
      menu = document.createElement("div");
    track.className = "photo-viewer-track";
    track.setAttribute("aria-label", "사진 넘기기");
    track.tabIndex = 0;
    count.setAttribute("aria-live", "polite");
    menu.className = "photo-options";
    menu.hidden = true;
    const close = iconButton(
      "사진 보기 닫기",
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M18 6 6 18"/></svg>',
      () => d.close(),
    );
    const options = iconButton("사진 옵션", dotsSvg, () => {
      menu.hidden = !menu.hidden;
      options.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden)
        menu.querySelector("button").focus({ preventScroll: true });
    });
    options.setAttribute("aria-expanded", "false");
    header.append(close, count, options);
    m.photos.forEach((p, i) => {
      const slide = document.createElement("div"),
        img = new Image();
      slide.className = "photo-slide";
      img.alt = `사진 ${i + 1}`;
      img.draggable = false;
      const retry = loadPhoto(
        slide,
        img,
        p.url || `/api/v1/sessions/${m.id}/photos/${p.id}`,
      );
      const retryButton = iconButton("사진 다시 불러오기", "↻", retry);
      retryButton.classList.add("photo-retry");
      slide.append(retryButton);
      track.append(slide);
    });
    const update = () => {
      const previousIndex = index;
      index = Math.max(
        0,
        Math.min(
          m.photos.length - 1,
          Math.round(track.scrollLeft / (track.clientWidth || 1)),
        ),
      );
      text(count, `${index + 1} / ${m.photos.length}`);
      prev.disabled = index === 0;
      next.disabled = index === m.photos.length - 1;
      if (previousIndex !== index) {
        menu.hidden = true;
        options.setAttribute("aria-expanded", "false");
      }
    };
    const move = (step) =>
      track.scrollTo({
        left:
          Math.max(0, Math.min(m.photos.length - 1, index + step)) *
          track.clientWidth,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    const arrow =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 6-6 6 6 6"/></svg>';
    const prev = iconButton("이전 사진", arrow, () => move(-1)),
      next = iconButton("다음 사진", arrow, () => move(1));
    prev.classList.add("photo-prev");
    next.classList.add("photo-next");
    button(menu, "사진 삭제", () => {
      menu.hidden = true;
      options.setAttribute("aria-expanded", "false");
      const p = m.photos[index];
      const confirm = dialog(
        "이 사진을 삭제할까요?",
        "연결된 기기에는 다음 동기화 때 반영돼요.",
      );
      button(
        confirm,
        "삭제",
        async () => {
          if (native)
            await bridge("removePhoto", { memoryId: m.id, photoId: p.id });
          else await api(`sessions/${m.id}/photos/${p.id}`, "DELETE");
          confirm.close();
          d.close();
          if(await render()&&!native&&page==="detail"&&record?.id===m.id){rememberWeb([record]);savedSyncNotice();}
        },
        true,
      );
      button(confirm, "취소", () => {
        confirm.close();
        options.focus();
      });
    });
    track.addEventListener("scroll", update, { passive: true });
    d.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        move(e.key === "ArrowLeft" ? -1 : 1);
      }
      if (e.key === "Escape" && !menu.hidden) {
        e.preventDefault();
        menu.hidden = true;
        options.setAttribute("aria-expanded", "false");
        options.focus();
      }
    });
    const restore = document.activeElement;
    d.addEventListener("close", () => {
      d.remove();
      restore?.focus();
    });
    d.append(header, track, prev, next, menu);
    document.body.append(d);
    d.showModal();
    track.scrollLeft = index * track.clientWidth;
    update();
    track.focus({ preventScroll: true });
  }
  function memoryOptions(m) {
    const d = dialog(title(m), memorySyncLabel(m));
    button(d, "내용 확인", () => {
      d.close();
      return edit(m);
    });
    if (native && m.saved) button(d, "제목 수정", () => {
      d.close();
      const editTitle=dialog("제목 수정", "");
      const label=document.createElement("label"), input=document.createElement("input");
      label.textContent="일기 제목";input.value=title(m);input.maxLength=80;label.append(input);editTitle.append(label);
      button(editTitle,"저장",async()=>{
        const value=input.value.trim();if(!value||value.length>80)throw Error("제목을 1~80자로 입력해 주세요.");
        await bridge("renameDiary",{memoryId:m.id,revision:m.revision,title:value});editTitle.close();await render();
      },true);
      button(editTitle,"취소",()=>editTitle.close());input.focus();input.select();
    });
    if (native && m.saved && vehicleState.paired && m.sync_status === "pending")
      button(d, "동기화 다시 시도", () => {
        d.close();
        return bridge("retrySync");
      });
    button(d, "일기 삭제", () => {
      const confirm = dialog(
        "이 일기를 삭제할까요?",
        m.linked
          ? "휴대폰 보관함의 일기·원본 녹음·사진도 함께 삭제돼요."
          : "이 차량의 일기·원본 녹음·사진을 삭제해요.",
      );
      button(
        confirm,
        "삭제",
        async () => {
          await bridge("delete", { memoryId: m.id });
          confirm.close();
          d.close();
          go("carlist", null);
        },
        true,
      );
      button(confirm, "취소", () => confirm.close());
    });
    button(d, "닫기", () => d.close());
  }
  function requestedLayout(root) {
    if (page === "detail") C(C(root)[3]).at(-1).remove();
    if (page === "cardetail")
      C(C(C(root)[1])[0])
        .at(-1)
        .remove();
    if (page === "carhome")
      C(C(C(root)[1])[1])
        .at(-1)
        .remove();
    if (page === "carlist")
      C(C(C(root)[1])[1])
        .at(-1)
        .remove();
  }
  // Normalize absent/empty snapshots without rewriting historical records.
  function vehicleFields(m) {
    const v = m.snapshot.context?.vehicle || {};
    return [v.nickname, v.brand, v.model, v.type, v.year, v.plate].map(
      (value) => String(value ?? "").trim(),
    );
  }
  function vehicleKey(m) {
    const fields = vehicleFields(m);
    return fields.some(Boolean) ? JSON.stringify(fields) : "unknown";
  }
  function vehicleLabel(m) {
    return vehicleFields(m).filter(Boolean).join(" · ") || "차량 정보 없음";
  }
  function filteredVehicles() {
    return items.filter(
      (m) => !vehicleFilter || vehicleKey(m) === vehicleFilter,
    );
  }
  function memorySyncLabel(m) {
    if (native && !m.saved) return "작성 중";
    if (m.sync_status === "other_vault") return "이전 가족 보관함의 기록";
    if (m.sync_status === "conflict") return "동기화 확인 필요";
    if (m.sync_status === "syncing") return "동기화 중";
    if (m.sync_status === "shared" || m.shared) return "동기화 완료";
    if (m.sync_status === "pending") return "동기화 대기";
    return "기기에 저장됨 · 연결 필요";
  }
  const phoneConnectionSvg='<svg data-connection-icon="phone" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>';
  function paintConnection(el,connected) {
    el.classList.add("connection-badge");
    if(el.dataset.connected===String(connected)&&el.querySelector('[data-connection-icon]'))return;
    el.dataset.connected=String(connected);
    el.innerHTML=phoneConnectionSvg;
    const label=connected?'연결 중':native?'휴대폰 연결 전':'연결하기';
    el.append(document.createTextNode(label));
    el.setAttribute('aria-label',connected?'휴대폰 연결 중':label);
    el.title=connected?'기기 연결이 등록되어 있어요. 기록 전송 상태는 각 기록과 설정에서 확인할 수 있어요.':label;
  }
  let seenSyncSequence, savedNoticeTimer;
  const knownWebRecords=new Map();
  let webSyncPrimed=false;
  const webSignature=m=>JSON.stringify([m.revision,m.audio_ready,(m.photos||[]).map(p=>[p.id,p.sha256])]);
  function rememberWeb(rows) {for(const m of rows)if(m.deleted)knownWebRecords.delete(m.id);else knownWebRecords.set(m.id,webSignature(m));}
  const webRecordsChanged=rows=>rows.some(m=>m.deleted?knownWebRecords.has(m.id):knownWebRecords.get(m.id)!==webSignature(m));
  function savedSyncNotice() {
    if(document.hidden||native&&(vehicleState.driving||vehicleState.recording))return;
    let el=document.querySelector('.sync-saved-notice');
    if(!el){el=document.createElement('div');el.className='sync-saved-notice';el.setAttribute('role','status');el.dataset.native=String(native);document.body.append(el);}
    text(el,'기록을 보관했어요.');
    clearTimeout(savedNoticeTimer);savedNoticeTimer=setTimeout(()=>el.remove(),4000);
  }
  function observeNativeSync(state) {
    if(state.driving||state.recording){document.querySelector(".sync-saved-notice")?.remove();clearTimeout(savedNoticeTimer);}
    const seq=Number(state.sync_change_seq);
    if(!Number.isFinite(seq))return;
    const changed=seenSyncSequence!==undefined&&seq>seenSyncSequence;
    seenSyncSequence=seq;
    if(changed)savedSyncNotice();
  }
  function searchRecords() {
    const needle = query.trim().toLocaleLowerCase();
    return filteredVehicles().filter(
      (m) =>
        !needle ||
        [m.snapshot.text, title(m), ...paragraphs(m), vehicleLabel(m)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle),
    );
  }
  function searchPanel() {
    const d = dialog("검색");
    panelClose(d);
    const form = document.createElement("form");
    form.className = "search-form";
    const label = document.createElement("label");
    label.textContent = "검색어";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "이야기나 차량 이름";
    input.setAttribute("aria-label", "일기 검색어");
    input.value = query;
    label.append(input);
    const vehicleLabelEl = document.createElement("label");
    vehicleLabelEl.textContent = "차량";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "기록 당시 차량 필터");
    select.add(new Option("모든 차량", ""));
    new Map(items.map((m) => [vehicleKey(m), vehicleLabel(m)])).forEach(
      (label, key) => select.add(new Option(label, key)),
    );
    select.value = vehicleFilter;
    vehicleLabelEl.append(select);
    form.append(label, vehicleLabelEl);
    d.append(form);
    const apply = () => {
      query = input.value.trim();
      vehicleFilter = select.value;
      monthOffset = 0;
      d.close();
      void render();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    button(d, "적용", apply, true);
    button(d, "초기화", () => {
      query = "";
      vehicleFilter = "";
      monthOffset = 0;
      d.close();
      void render();
    });
    input.focus();
  }
  function searchButton() {
    const b = document.createElement("button");
    b.className = "library-search";
    b.type = "button";
    b.setAttribute("aria-label", "검색");
    b.dataset.active = String(!!query || !!vehicleFilter);
    b.innerHTML =
      '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
    const count = Number(!!query) + Number(!!vehicleFilter);
    b.append(document.createTextNode(count ? `검색 · ${count}` : "검색"));
    action(b, searchPanel);
    return b;
  }
  async function selectTheme(mode) {
    if (native) window.DiaryTheme.native(await bridge("setTheme", { mode }));
    else window.DiaryTheme.set(mode);
    if (mode !== "auto") {
      clearTimeout(themeNoticeTimer);
      document.querySelector(".theme-notice")?.remove();
    }
  }
  function updateThemeShortcuts() {
    const dark = document.documentElement.dataset.theme === "dark";
    app.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      const label = dark ? "라이트 모드로 전환" : "다크 모드로 전환";
      b.setAttribute("aria-label", label);
      b.title = label;
      b.dataset.targetTheme = dark ? "light" : "dark";
      b.innerHTML =
        '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        (dark
          ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
          : '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>') +
        "</svg>";
    });
    const names = { auto: "자동", light: "라이트", dark: "다크" };
    const mode = window.DiaryTheme.mode;
    const next = { auto: "light", light: "dark", dark: "auto" }[mode];
    app.querySelectorAll("[data-theme-cycle]").forEach((b) => {
      b.dataset.targetTheme = next;
      b.dataset.currentTheme = mode;
      const current =
        mode === "auto"
          ? `자동 · 현재 ${dark ? "다크" : "라이트"}`
          : names[mode];
      b.setAttribute(
        "aria-label",
        `화면 모드 ${current}, ${names[next]}로 전환`,
      );
      b.title = `${current} · 누르면 ${names[next]}`;
      const icon =
        mode === "auto"
          ? '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2"/>'
          : mode === "light"
            ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>'
            : '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>';
      b.innerHTML = `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span>${names[mode]}</span>`;
    });
  }
  let themeNoticeTimer;
  function showThemeNotice() {
    let notice = document.querySelector(".theme-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "theme-notice";
      notice.setAttribute("role", "status");
      document.body.append(notice);
    }
    const dark = document.documentElement.dataset.theme === "dark";
    text(
      notice,
      `${native ? "차량" : "휴대폰"} 화면 설정을 따라요 · 현재 ${dark ? "다크" : "라이트"}`,
    );
    clearTimeout(themeNoticeTimer);
    themeNoticeTimer = setTimeout(() => notice.remove(), 4500);
  }
  function themeShortcut(root) {
    const group = document.createElement("div");
    group.className = "theme-shortcut";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "화면 테마");
    const toggle = document.createElement("button");
    toggle.type = "button";
    const car = page.startsWith("car") || page === "recording";
    if (car) toggle.dataset.themeCycle = "true";
    else toggle.dataset.themeToggle = "true";
    action(toggle, async () => {
      toggle.disabled = true;
      try {
        await selectTheme(toggle.dataset.targetTheme);
        if (car && window.DiaryTheme.mode === "auto") showThemeNotice();
      } finally {
        toggle.disabled = false;
      }
    });
    group.append(toggle);
    if (car) {
      const rail = root.querySelector("nav"),
        settings = rail?.querySelector('a[href="#"]');
      if (settings) {
        settings.style.marginTop = "0";
        rail.insertBefore(group, settings);
      } else rail?.append(group);
    } else {
      const head = root.firstElementChild;
      if (page === "main")
        head.firstElementChild.insertBefore(
          group,
          head.firstElementChild.lastElementChild,
        );
      else if (page === "detail") head.lastElementChild.prepend(group);
      else if (page === "transcript") {
        const search = head.lastElementChild,
          actions = document.createElement("div");
        actions.className = "header-actions";
        head.append(actions);
        actions.append(group, search);
        head.children[1].classList.add("transcript-heading");
      } else if (page === "connect") head.lastElementChild.replaceWith(group);
    }
    updateThemeShortcuts();
  }
  window.addEventListener("diarythemechange", updateThemeShortcuts);
  function locationLabel(location) {
    if (location?.status === "available")
      return location.label + " · 에뮬레이터 위치";
    return (
      {
        synthetic: "샘플 나들이 주차장 · 모의 위치",
        stale: "최근 위치를 확인하지 못했어요",
        denied: "위치 접근 권한 없음",
        unsupported: "이 환경은 위치 조회 미지원",
        error: "위치를 확인하지 못했어요",
      }[location?.status] || "위치 미수집"
    );
  }
  function monthly(rows) {
    const groups = new Map();
    rows.forEach((m) => {
      const k = date(m.snapshot.recorded_at, {
        year: "numeric",
        month: "long",
      });
      groups.set(k, [...(groups.get(k) || []), m]);
    });
    return [...groups];
  }
  async function fillMobileList(root) {
    const head = C(root)[0],
      list = C(root)[1];
    const month = clone(C(list)[0]),
      card = clone(C(list)[1]);
    list.classList.add("mobile-memory-list");
    const header = head.firstElementChild;
    header.classList.add("mobile-library-header");
    const brand = header.firstElementChild;
    brand.className = "mobile-brand";
    const logo = document.createElement("img");
    logo.src = "brand/chagok-logo.svg";
    logo.alt = "";
    logo.width = logo.height = 32;
    const name = document.createElement("span");
    name.textContent = "차곡차곡";
    brand.replaceChildren(logo, name);
    head.querySelector("h1")?.parentElement.remove();
    const tools = document.createElement("div");
    tools.className = "library-tools";
    tools.append(searchButton());
    head.append(tools);
    list.replaceChildren();
    for (const [label, rows] of monthly(searchRecords())) {
      const h = clone(month);
      text(C(h)[0], label);
      text(C(h)[1], `일기 ${rows.length}개`);
      if (list.children.length) h.style.marginTop = "12px";
      list.append(h);
      for (const m of rows) {
        const row = clone(card),
          [day, body, photo] = C(row);
        text(
          C(day)[0],
          date(m.snapshot.recorded_at, { day: "2-digit" }).replace("일", ""),
        );
        text(C(day)[1], date(m.snapshot.recorded_at, { weekday: "long" }));
        text(C(body)[0], title(m));
        text(C(body)[1], paragraphs(m).join(" ") || m.snapshot.text);
        C(body)[1].classList.add("story-excerpt");
        const meta = C(body)[2];
        tail(C(meta)[0], minutes(m));
        tail(C(meta)[1], `사진 ${m.photos.length}장`);
        text(C(meta)[2], m.snapshot.speaker);
        if (!m.photos.length) {
          C(meta)[1].remove();
          photo.remove();
        } else fillPhoto(photo, m, m.photos[0], 0);
        action(row, () => go("detail", m.id));
        list.append(row);
      }
    }
    if (!list.children.length) {
      const p = document.createElement("p");
      text(
        p,
        query || vehicleFilter
          ? "찾는 일기가 없어요."
          : "차량에서 완성한 첫 일기를 기다리고 있어요.",
      );
      list.append(p);
    }
    const devices = await api("devices");
    if (!root.isConnected) return;
    deviceFingerprint = JSON.stringify(devices.devices);
    const connected = activeDevice(devices.devices);
    paintConnection(head.querySelector("a"),!!connected);
  }
  let photoUploading = false;
  function photoFeedback(message, busy) {
    const status = app.querySelector("[data-photo-status]");
    if (status) {
      text(status, message);
      status.hidden = !message;
    }
    const add = app.querySelector(".photo-add");
    if (add) {
      add.disabled = busy;
      add.setAttribute("aria-busy", String(busy));
    }
  }
  async function upload() {
    if (photoUploading) return;
    if (record?.photos.length >= 8) {
      showError(
        Error(
          "사진은 일기마다 8장까지 추가할 수 있어요. 기존 사진을 삭제한 뒤 추가해 주세요.",
        ),
      );
      return;
    }
    const memoryId = selected;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("aria-label", "사진 파일 선택");
    input.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px";
    document.body.append(input);
    photoFeedback("사진 선택을 기다리고 있어요…", false);
    input.oncancel = () => {
      photoFeedback("", false);
      input.remove();
    };
    input.onchange = async () => {
      let timer, controller;
      try {
        const file = input.files[0];
        if (!file) return;
        photoUploading = true;
        photoFeedback("사진을 확인하고 있어요…", true);
        if (!file.size) throw Error("빈 파일은 추가할 수 없어요.");
        if (file.size > 10 * 1024 * 1024)
          throw Error(
            `사진 용량이 ${(file.size / 1048576).toFixed(1)}MB예요. 10MB 이하로 선택해 주세요.`,
          );
        const header = await Promise.race([
          file.slice(0, 12).arrayBuffer(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Error(
                    "사진을 읽는 데 시간이 오래 걸려요. 기기에 저장된 사진을 다시 선택해 주세요.",
                  ),
                ),
              15000,
            );
          }),
        ]);
        clearTimeout(timer);
        const b = new Uint8Array(header);
        if (!(
          (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
          (b[0] === 137 &&
            b[1] === 80 &&
            b[2] === 78 &&
            b[3] === 71 &&
            b[4] === 13 &&
            b[5] === 10 &&
            b[6] === 26 &&
            b[7] === 10) ||
          (String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...b.slice(8, 12)) === "WEBP")
        ))
          throw Error(
            "JPG·PNG·WebP 사진을 선택해 주세요. HEIC 사진은 변환이 필요해요.",
          );
        photoFeedback("사진을 올리고 있어요…", true);
        controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 45000);
        await api(`sessions/${memoryId}/photos`, "POST", file, {
          signal: controller.signal,
        });
        if (selected === memoryId && page === "detail") {
          if(await render()&&page==="detail"&&record?.id===memoryId){rememberWeb([record]);savedSyncNotice();}
          photoFeedback("", false);
        }
      } catch (e) {
        photoFeedback("사진 추가를 완료하지 못했어요.", false);
        showError(
          controller?.signal.aborted
            ? Error(
                "사진 전송 응답이 늦어지고 있어요. 새로고침해 추가 여부를 확인한 뒤 다시 시도해 주세요.",
              )
            : e instanceof TypeError
              ? Error(
                  "사진을 전송하지 못했어요. 서버 연결을 확인한 뒤 다시 시도해 주세요.",
                )
              : e,
        );
      } finally {
        clearTimeout(timer);
        photoUploading = false;
        const add = app.querySelector(".photo-add");
        if (add) {
          add.disabled = false;
          add.setAttribute("aria-busy", "false");
        }
        input.remove();
      }
    };
    try {
      input.click();
    } catch (e) {
      input.remove();
      showError(e);
    }
  }
  function fillDetail(root, m) {
    const [top, heading, photoRow, paper, voice] = C(root);
    const buttons = top.querySelectorAll("button");
    action(buttons[0], () => edit(m));
    action(buttons[1], () => share(m));
    text(
      C(heading)[0],
      date(m.snapshot.recorded_at, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }),
    );
    text(C(heading)[1], title(m));
    const tags = C(C(heading)[2]);
    tail(tags[0], "녹음 " + minutes(m));
    text(tags[1], m.snapshot.speaker);
    tail(tags[2], m.audio_ready ? "차량과 동기화됨" : "원본 전송 대기");
    const tiles = C(photoRow),
      tile = clone(tiles[0]),
      add = tiles[2];
    photoRow.replaceChildren();
    photoRow.classList.add("photo-strip");
    photoRow.setAttribute("aria-label", "일기 사진");
    m.photos.forEach((p, i) => {
      const el = clone(tile);
      fillPhoto(el, m, p, i);
      photoRow.append(el);
    });
    const toolbar = document.createElement("div");
    toolbar.className = "photo-toolbar";
    const label = document.createElement("span");
    text(label, `사진 ${m.photos.length}장`);
    add.removeAttribute("style");
    add.className = "photo-add";
    toolbar.append(label, add);
    photoRow.before(toolbar);
    photoRow.hidden = m.photos.length === 0;
    // Keep file picker invocation in the original click gesture on mobile browsers.
    add.onclick = (e) => {
      e.preventDefault();
      void upload();
    };
    add.disabled = photoUploading;
    const photoStatus = document.createElement("p");
    photoStatus.dataset.photoStatus = "true";
    photoStatus.className = "photo-status";
    photoStatus.setAttribute("role", "status");
    photoStatus.hidden = !photoUploading;
    text(photoStatus, photoUploading ? "사진을 올리고 있어요…" : "");
    toolbar.after(photoStatus);
    tail(
      C(paper)[0],
      m.snapshot.generation_mode === "mock"
        ? "목업 일기 · AI 정리 전"
        : "AI가 정리한 일기",
    );
    const pTemplate = clone(C(paper)[1]);
    paper.querySelectorAll(":scope>p").forEach((p) => p.remove());
    for (const content of paragraphs(m)) {
      const p = clone(pTemplate);
      text(p, content);
      paper.append(p);
    }

    const [voiceHead, controls, sources, link] = C(voice);
    text(C(voiceHead)[1], "0:00 / " + stamp(m.snapshot.duration_ms / 1000));
    C(voiceHead)[1].dataset.time = "combined";
    action(controls.querySelector("button"), () => toggle(m));
    controls.querySelector("button").dataset.play = "true";
    makeWave(C(controls)[1], m);
    const sourceRow = clone(C(sources)[0]);
    sources.replaceChildren(sourceRow);
    text(C(sourceRow)[0], m.snapshot.speaker);
    text(C(sourceRow)[1], m.snapshot.text);
    C(sourceRow)[1].classList.add("story-excerpt");
    action(link, () => go("transcript", m.id));
  }
  async function edit(m) {
    if (native) return bridge("edit", { memoryId: m.id });
    const d = dialog(
      "일기 편집",
      "일기 내용 수정은 차량의 내용 확인 화면에서 할 수 있어요.",
    );
    button(d, "차량·녹음 위치 보기", () => {
      const c = m.snapshot.context;
      const info = dialog(
        "기록 당시 정보",
        c
          ? Object.entries(c.vehicle)
              .filter(([k, v]) => k !== "source" && v)
              .map(([, v]) => v)
              .join(" · ") +
              "\n녹음 시작 위치: " +
              locationLabel(c.location)
          : "기록 당시 정보가 없어요.",
      );
      button(info, "닫기", () => info.close());
    });
    button(d, "일기와 원본 삭제", () => {
      const c = dialog(
        "이 일기를 삭제할까요?",
        "일기·원본 녹음·사진을 함께 삭제해요.",
      );
      button(
        c,
        "삭제",
        async () => {
          await api(`sessions/${m.id}`, "DELETE", {
            expected_revision: m.revision,
          });
          c.close();
          d.close();
          go("main", null);
        },
        true,
      );
      button(c, "취소", () => c.close());
    });
    button(d, "닫기", () => d.close());
  }
  async function share(m) {
    if (native) return bridge("share", { memoryId: m.id });
    const d = dialog("공유");
    button(d, "일기 공유", async () => {
      const data = { title: title(m), text: paragraphs(m).join("\n\n") };
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.title + "\n\n" + data.text);
        text(d.querySelector("h2"), "일기를 복사했어요");
      }
    });
    button(d, "원본 녹음 내려받기", async () => {
      await prepareAudio(m);
      const a = document.createElement("a");
      a.href = mediaUrl;
      a.download = "chagok-original.wav";
      a.click();
    });
    button(d, "닫기", () => d.close());
  }
  function pauseAudio() {
    playbackEpoch++;
    audio.pause();
  }
  async function playAudio() {
    const epoch = playbackEpoch;
    try {
      await audio.play();
    } catch (error) {
      if (error.name !== "AbortError" || epoch === playbackEpoch) throw error;
    }
  }
  async function prepareAudio(m) {
    if (native) return;
    if (mediaId === m.id && mediaUrl) {
      m.waveform = mediaWave;
      return;
    }
    pauseAudio();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaId = null;
    mediaUrl = null;
    const r = await fetch(`/api/v1/sessions/${m.id}/audio`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!r.ok) throw Error("녹음 원본을 불러오지 못했어요.");
    const blob = await r.blob();
    m.waveform = mediaWave = waveEnvelope(await blob.arrayBuffer());
    if (record?.id === m.id) record.waveform = m.waveform;
    mediaUrl = URL.createObjectURL(blob);
    mediaId = m.id;
    audio.src = mediaUrl;
    audio.load();
  }
  async function toggle(m) {
    if (!m.audio_ready) throw Error("녹음 원본이 아직 준비되지 않았어요.");
    if (native) {
      updateAudio(await bridge("play", { memoryId: m.id }));
      return;
    }
    await prepareAudio(m);
    if (audio.paused) await playAudio();
    else pauseAudio();
    updateAudio();
  }
  // Captured originals use mono PCM16 WAV. Read-only, bounded sampling per bin.
  function waveEnvelope(buffer) {
    const v = new DataView(buffer);
    if (
      v.byteLength < 46 ||
      v.getUint16(20, true) !== 1 ||
      v.getUint16(34, true) !== 16
    )
      return [];
    let offset = 12,
      size = 0;
    while (offset + 8 <= v.byteLength) {
      size = v.getUint32(offset + 4, true);
      if (v.getUint32(offset, false) === 0x64617461) {
        offset += 8;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    const samples = Math.floor(Math.min(size, v.byteLength - offset) / 2);
    if (samples <= 0) return [];
    return Array.from({ length: 128 }, (_, bin) => {
      const start = Math.floor((bin * samples) / 128),
        end = Math.min(
          samples,
          Math.max(start + 1, Math.floor(((bin + 1) * samples) / 128)),
        );
      const count = Math.min(256, end - start);
      let sum = 0;
      for (let j = 0; j < count; j++) {
        const x =
          v.getInt16(
            offset + 2 * (start + Math.floor((j * (end - start)) / count)),
            true,
          ) / 32768;
        sum += x * x;
      }
      return count ? Math.sqrt(sum / count) : 0;
    });
  }
  function makeWave(el, m) {
    el.classList.add("wave-progress");
    if (!el.querySelector("[data-progress]")) {
      el.replaceChildren();
      el.classList.add("playback-wave");
      for (let i = 0; i < 32; i++) {
        const bar = document.createElement("span");
        bar.dataset.waveBar = i;
        el.append(bar);
      }
    }
    const input = document.createElement("input");
    input.type = "range";
    input.min = 0;
    input.max = m.snapshot.duration_ms / 1000;
    input.step = ".1";
    input.value = 0;
    input.setAttribute("aria-label", "녹음 재생 위치");
    input.oninput = () => seek(Number(input.value)).catch(showError);
    el.removeAttribute("aria-hidden");
    el.append(input);
    updateAudio(native ? vehicleState : undefined);
  }
  async function seek(n) {
    if (native) {
      const state = await bridge("seek", { position: n, memoryId: record?.id });
      updateAudio({ ...state, position: n });
      return;
    }
    if (!record) return;
    await prepareAudio(record);
    audio.currentTime = Math.max(
      0,
      Math.min(n, record.snapshot.duration_ms / 1000),
    );
    updateAudio();
  }
  const playSvg =
    '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z"/></svg>';
  const pauseSvg =
    '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  let playbackFrame = 0,
    playbackAnchor = { position: 0, playing: false, at: 0 };
  function updateAudio(state) {
    if (native && state) {
      const sameOriginal = state.audio_memory === record?.id ||
        (!state.audio_busy && state.memoryId === record?.id);
      playbackAnchor = {
        position: sameOriginal ? state.position || 0 : 0,
        playing: sameOriginal && !!state.playing,
        at: performance.now(),
      };
    }
    cancelAnimationFrame(playbackFrame);
    paintPlayback();
  }
  function paintPlayback() {
    const playing = native ? playbackAnchor.playing : !audio.paused,
      t = native
        ? playbackAnchor.position +
          (playing
            ? Math.min(0.5, (performance.now() - playbackAnchor.at) / 1000)
            : 0)
        : audio.currentTime,
      total = (record?.snapshot.duration_ms || 0) / 1000;
    app
      .querySelectorAll("[data-time]")
      .forEach((el) =>
        text(
          el,
          el.dataset.time === "combined"
            ? stamp(t) + " / " + stamp(total)
            : el.dataset.time === "total"
              ? stamp(total)
              : stamp(t),
        ),
      );
    app.querySelectorAll("[data-play]").forEach((el) => {
      el.setAttribute("aria-label", playing ? "일시정지" : "재생");
      el.innerHTML = playing ? pauseSvg : playSvg;
    });
    app.querySelectorAll("input[type=range]").forEach((el) => (el.value = t));
    const progress = app.querySelector("[data-progress]");
    if (progress) {
      progress.style.width = (total ? Math.min(1, t / total) * 100 : 0) + "%";
      progress.style.background = "#FF6A4D";
    }
    app.querySelectorAll("[data-segment-start]").forEach((row) => {
      const current =
        (native
          ? vehicleState.audio_memory === row.dataset.memoryId &&
            !vehicleState.tts_active
          : mediaId === row.dataset.memoryId) &&
        t * 1000 >= Number(row.dataset.segmentStart) &&
        t * 1000 < Number(row.dataset.segmentEnd);
      row.setAttribute("aria-current", current ? "true" : "false");
    });
    const envelope = record?.waveform || [],
      max = Math.max(0.001, ...envelope);
    app.querySelectorAll("[data-wave-bar]").forEach((bar, i) => {
      const from = Math.floor((i * envelope.length) / 32),
        to = Math.floor(((i + 1) * envelope.length) / 32);
      const amplitude = Math.max(0, ...envelope.slice(from, to)) / max;
      const fraction = total ? (t / total) * 32 - i : 0;
      const active = playing && fraction >= 0 && fraction < 1;
      const sample =
        envelope[
          Math.min(
            envelope.length - 1,
            Math.floor((t / (total || 1)) * envelope.length),
          )
        ] || 0;
      bar.style.height =
        4 + amplitude * 28 + (active ? (sample / max) * 12 : 0) + "px";
      bar.style.background = `linear-gradient(to right, #FF6A4D ${Math.max(0, Math.min(1, fraction)) * 100}%, #454D5C ${Math.max(0, Math.min(1, fraction)) * 100}%)`;
      bar.dataset.played = Math.max(0, Math.min(1, fraction)).toFixed(3);
      bar.classList.toggle("is-current", active);
    });
    app
      .querySelectorAll("[data-play-label]")
      .forEach((el) => tail(el, playing ? "일시정지" : "녹음 원문 듣기"));
    if (playing && !document.hidden && app.querySelector(".wave-progress"))
      playbackFrame = requestAnimationFrame(paintPlayback);
  }
  audio.ontimeupdate = () => updateAudio();
  audio.onplay = () => updateAudio();
  audio.onpause = () => updateAudio();
  audio.onended = () => updateAudio();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(playbackFrame);
    else updateAudio();
  });
  let segmentJump = 0,
    timelineLoad = null;
  async function jumpOriginal(m, segment) {
    if (!m.audio_ready) throw Error("녹음 원본이 아직 준비되지 않았어요.");
    if (native) {
      window.nativeStatus(
        await bridge("playSegment", { memoryId: m.id, segmentId: segment.id }),
      );
      return;
    }
    const jump = ++segmentJump,
      renderToken = generation;
    if (!timelineLoad || timelineLoad.id !== m.id) {
      const load = { id: m.id, promise: prepareAudio(m) };
      timelineLoad = load;
      load.promise
        .finally(() => {
          if (timelineLoad === load) timelineLoad = null;
        })
        .catch(() => {});
    }
    await timelineLoad.promise;
    if (jump !== segmentJump || renderToken !== generation) return;
    if (audio.readyState < 1)
      await new Promise((resolve, reject) => {
        const clear = () => {
          clearTimeout(timeout);
          audio.removeEventListener("loadedmetadata", ready);
          audio.removeEventListener("error", error);
        };
        const ready = () => {
            clear();
            resolve();
          },
          error = () => {
            clear();
            reject(Error("원본을 불러오지 못했어요."));
          };
        const timeout = setTimeout(error, 10000);
        audio.addEventListener("loadedmetadata", ready);
        audio.addEventListener("error", error);
      });
    if (jump !== segmentJump || renderToken !== generation) return;
    audio.currentTime = segment.start_ms / 1000;
    await playAudio();
    updateAudio();
  }
  function timelineRows(m) {
    const timeline = m.snapshot.speech_timeline;
    return timeline?.source === "pleos_epd_pcm_v1" &&
      Array.isArray(timeline.segments)
      ? timeline.segments
      : [];
  }
  function fillTimeline(list, m) {
    list.replaceChildren();
    list.classList.add("original-timeline");
    const rows = timelineRows(m);
    if (!rows.length) {
      const note = document.createElement("p");
      note.className = "timeline-note";
      text(
        note,
        m.snapshot.raw_history?.length
          ? "이 기록에는 발언별 시간 정보가 없어요."
          : "구간 정보 없이 확인한 이야기를 표시해요.",
      );
      list.append(note);
      const raw = document.createElement("p");
      raw.className = "timeline-legacy";
      text(
        raw,
        m.snapshot.raw_history?.at(-1) ||
          m.snapshot.text ||
          "인식 원문이 없어요.",
      );
      list.append(raw);
      return;
    }
    rows.forEach((segment) => {
      const timed =
        Number.isInteger(segment.start_ms) &&
        Number.isInteger(segment.end_ms) &&
        segment.start_ms >= 0 &&
        segment.end_ms > segment.start_ms &&
        segment.end_ms <= m.snapshot.duration_ms;
      const row = document.createElement(timed ? "button" : "div");
      row.className = "timeline-segment";
      const time = document.createElement("span"),
        body = document.createElement("span");
      time.className = "timeline-time";
      text(time, timed ? stamp(segment.start_ms / 1000) : "시간 미확인");
      text(body, segment.text);
      row.append(time, body);
      list.append(row);
      if (timed) {
        row.type = "button";
        row.dataset.segmentStart = segment.start_ms;
        row.dataset.segmentEnd = segment.end_ms;
        row.dataset.memoryId = m.id;
        row.setAttribute(
          "aria-label",
          `${stamp(segment.start_ms / 1000)}부터 재생: ${segment.text}`,
        );
        action(row, async () => {
          row.setAttribute("aria-busy", "true");
          try {
            await jumpOriginal(m, segment);
          } finally {
            row.removeAttribute("aria-busy");
          }
        });
      }
    });
    updateAudio(native ? vehicleState : undefined);
  }
  function fillTranscript(root, m) {
    const [head, list, player] = C(root);
    text(
      C(C(head)[1])[1],
      date(m.snapshot.recorded_at, { month: "long", day: "numeric" }) +
        " · " +
        title(m),
    );
    fillTimeline(list, m);
    action(head.querySelector("button"), () => {
      const d = dialog("원문에서 검색"),
        input = document.createElement("input");
      input.setAttribute("aria-label", "원문 검색어");
      d.append(input);
      button(d, "찾기", () => {
        const found = [
          ...list.querySelectorAll(".timeline-segment,.timeline-legacy"),
        ].find((row) => row.textContent.includes(input.value));
        d.close();
        if (found) {
          found.scrollIntoView({ block: "center", behavior: "instant" });
          found.focus();
        } else showError(Error("일치하는 원문이 없어요."));
      });
      button(d, "닫기", () => d.close());
    });
    const track = C(C(player)[0])[0];
    C(track)[0].dataset.progress = "true";
    C(track)[0].style.width = "0%";
    makeWave(track, m);
    const times = C(C(player)[0])[1];
    C(times)[0].dataset.time = "current";
    C(times)[1].dataset.time = "total";
    const controls = C(player)[1],
      speed = C(controls)[0],
      middle = C(controls)[1],
      bookmark = C(controls)[2];
    action(speed, () => {
      audio.playbackRate =
        audio.playbackRate === 2 ? 1 : audio.playbackRate + 0.25;
      text(speed, audio.playbackRate.toFixed(2).replace(/0$/, "") + "x");
    });
    action(C(middle)[0], () =>
      seek((native ? vehicleState.position : audio.currentTime) - 15),
    );
    C(middle)[1].dataset.play = "true";
    action(C(middle)[1], () => toggle(m));
    action(C(middle)[2], () =>
      seek((native ? vehicleState.position : audio.currentTime) + 15),
    );
    action(bookmark, () => edit(m));
    updateAudio();
  }
  let deviceFingerprint = "";
  let connectionExpiryTimer;
  const activeDevice = (devices) => devices.find(
    (x) => !x.revoked_at && Date.parse(x.expires_at) > Date.now(),
  );
  async function fillConnect(root) {
    const [top, intro, card, steps, footer] = C(root);
    const data = await api("devices");
    deviceFingerprint = JSON.stringify(data.devices);
    const active = activeDevice(data.devices);
    clearTimeout(connectionExpiryTimer);
    root.classList.add("connection-page");
    root.dataset.connected = String(!!active);
    const identity = C(card)[1],
      digits = C(card)[2];
    text(C(identity)[0], active?.label || "우리 집 차");
    text(C(identity)[1], active ? "가족 보관함에 연결됨" : "연결 코드로 연결");
    text(C(intro)[0], active ? "차량과 연결됐어요" : "차량을 연결해요");
    text(
      C(intro)[1],
      active
        ? "차량과 휴대폰에서 같은 일기와 목소리를 볼 수 있어요."
        : "연결 코드를 만든 뒤 차량 화면에 입력해 주세요.",
    );
    digits.classList.add("pairing-code-digits");
    digits.replaceChildren(
      ...Array.from({ length: 6 }, () => {
        const digit = document.createElement("span");
        digit.textContent = "–";
        digit.setAttribute("aria-hidden", "true");
        return digit;
      }),
    );
    digits.removeAttribute("aria-label");
    digits.removeAttribute("role");
    if (active) digits.remove();
    const showSteps = (issued) => {
      steps.replaceChildren();
      steps.classList.add("connection-steps");
      if (active) { steps.remove(); return; }
      const list = document.createElement("ol");
      list.setAttribute("aria-label", "차량 연결 순서");
      const copy = [
        ["휴대폰에서 코드 만들기", issued ? "연결 코드가 준비됐어요." : "아래 버튼을 눌러 6자리 코드를 받아요."],
        ["차량에 코드 입력하기", "차량 설정 → 휴대폰 연결하기에서 입력해요."],
        ["연결 완료 확인하기", "이 화면이 ‘차량과 연결됐어요’로 바뀌면 완료예요."],
      ];
      copy.forEach(([heading, body], i) => {
        const row = document.createElement("li"), mark = document.createElement("span"), words = document.createElement("div");
        row.dataset.step = issued && i === 0 ? "done" : i === (issued ? 1 : 0) ? "current" : "next";
        if (row.dataset.step === "current") row.setAttribute("aria-current", "step");
        mark.className = "connection-step-mark";
        mark.textContent = issued && i === 0 ? "✓" : String(i + 1);
        mark.setAttribute("aria-hidden", "true");
        const title = document.createElement("strong"), detail = document.createElement("p");
        title.textContent = heading; detail.textContent = body;
        words.append(title, detail); row.append(mark, words); list.append(row);
      });
      steps.append(list);
    };
    showSteps(false);
    const [primary, secondary] = C(footer);
    text(primary, active ? "연결 차량 관리" : "차량 연결 코드 만들기");
    if (active) secondary.remove();
    else text(secondary, "다시 확인");
    action(primary, async () => {
      if (active) {
        const d = dialog("연결 차량");
        const label = document.createElement("label");
        text(label, "차 별명");
        const input = document.createElement("input");
        input.value = active.label;
        input.maxLength = 40;
        label.append(input);
        d.append(label);
        button(
          d,
          "차 별명 저장",
          async () => {
            await api("devices/" + active.id, "PATCH", {
              label: input.value.trim(),
            });
            d.close();
            render();
          },
          true,
        );
        button(d, "연결 해제", async () => {
          const c = dialog(
            "차량 연결을 해제할까요?",
            "다음 연결 때 차량의 공유 사본이 삭제돼요.",
          );
          button(c, "해제", async () => {
            await api("devices/" + active.id, "DELETE");
            c.close();
            d.close();
            render();
          });
          button(c, "취소", () => c.close());
        });
        button(d, "닫기", () => d.close());
      } else {
        const code = await api("pairings", "POST", {});
        if (!/^\d{6}$/.test(code.code)) throw Error("연결 코드를 다시 받아 주세요.");
        showSteps(true);
        C(digits).forEach((x, i) => {
          text(x, code.code.slice(i, i + 1));
          x.style.fontSize = "25px";
        });
        digits.setAttribute("aria-label", "차량 연결 코드 " + code.code);
        text(
          C(identity)[1],
          new Date(code.expires_at).toLocaleTimeString("ko-KR") + "까지 입력",
        );
        text(primary, "새 연결 코드 만들기");
        clearTimeout(connectionExpiryTimer);
        connectionExpiryTimer = setTimeout(() => {
          if (!root.isConnected) return;
          C(digits).forEach((x) => text(x, "–"));
          digits.removeAttribute("aria-label");
          text(C(identity)[1], "코드가 만료됐어요. 새로 만들어 주세요.");
          showSteps(false);
        }, Math.min(2147483647, Math.max(0, Date.parse(code.expires_at) - Date.now())));
      }
    });
    action(secondary, () => (active ? go("main", null) : render()));
  }
  function fillCarHome(root) {
    const [primary, side] = C(C(root)[1]);
    paintConnection(C(primary)[0],!!vehicleState.paired);
    C(primary)[0].dataset.syncState = "true";
    const recordLink=C(primary)[2], recordButton=document.createElement("button");
    recordButton.type="button";
    recordButton.style.cssText=recordLink.style.cssText;
    recordButton.style.border="0";
    recordButton.style.fontFamily="inherit";
    recordButton.replaceChildren(...recordLink.childNodes);
    recordLink.replaceWith(recordButton);
    recordButton.dataset.recordStart="true";
    action(recordButton, start);
    const [heading, card, more] = C(side);
    C(heading)[1].dataset.homeCount="true";
    text(C(heading)[1],`전체 기록 ${items.length}개`);
    const m = items[0];
    if (m) {
      const [photo, when, name, summary] = C(card);
      fillPhoto(photo, m, m.photos[0], 0);
      text(
        C(when)[0],
        date(m.snapshot.recorded_at, { day: "2-digit" }).replace("일", ""),
      );
      text(
        C(when)[1],
        date(m.snapshot.recorded_at, { month: "long", weekday: "long" }),
      );
      text(name, title(m));
      text(summary, paragraphs(m).join(" ") || m.snapshot.text);
      summary.classList.add("story-excerpt");
      action(card, () =>
        go(native && !m.saved ? "carreview" : "cardetail", m.id),
      );
    } else {
      C(card)
        .slice(1)
        .forEach((e) => e.remove());
      text(C(card)[0], "아직 남긴 일기가 없어요");
      action(card, () => go("carlist"));
    }
    action(more, () => go("carlist"));
  }
  function playlistRows() {
    return searchRecords()
      .filter(
        (m) =>
          m.saved && m.draft_current && paragraphs(m).some((s) => s.trim()),
      )
      .sort(
        (a, b) =>
          b.snapshot.recorded_at.localeCompare(a.snapshot.recorded_at) ||
          a.id.localeCompare(b.id),
      );
  }
  // One parked player is mounted after each screen is filled, including home/settings.
  function playlistControls(parent) {}
  function updatePlaylist(state) {
    const narration = app.querySelector("[data-narrate]");
    if (narration) {
      const active=state.playback?.active && state.playback.memory===selected && state.playback.mode==="diary";
      tail(narration, active && state.playback.playing ? "일기 일시정지" : active && state.playback.paused ? "일기 이어 읽기" : "일기 읽어주기");
      narration.disabled=!!state.playback?.settling || !!state.playback?.preparing;
      narration.title="일기는 멈춘 문장부터 이어 읽어요";
    }

    app.classList.toggle("tts-active", native && !!state.tts_active);
    if (native && !state.driving && app.firstElementChild)
      window.DiaryParkedPlayer?.render(app.firstElementChild, state, {
        action, stamp,
        command: action => listenRequest("listenAction",{action}),
      });
    const recordStart = app.querySelector("[data-record-start]");
    if (recordStart) recordStart.disabled = !state.can_record;
    const start = app.querySelector("[data-tts-start]");
    if (start)
      start.disabled =
        !!state.tts_active ||
        !!state.recording ||
        !!state.stt_busy ||
        Number(start.dataset.count) === 0;
  }
  function fillCarList(root) {
    const content = C(root)[1],
      [head, grid, older, olderGrid] = C(content);
    const tools = document.createElement("div");
    tools.className = "library-tools";
    tools.append(searchButton());
    content.insertBefore(tools, head);
    if (native) {
      const slot = document.createElement("div");
      content.insertBefore(slot, head);
      playlistControls(slot);
    }
    const groups = monthly(searchRecords()),
      current = groups[monthOffset] || [
        query || vehicleFilter
          ? "찾는 일기가 없어요"
          : "아직 남긴 일기가 없어요",
        [],
      ],
      previous = groups[monthOffset + 1];
    text(C(C(head)[0])[0], current[0]);
    text(C(C(head)[0])[1], `일기 ${current[1].length}개`);
    const template = clone(C(grid)[0]);
    function populate(target, rows) {
      target.replaceChildren();
      rows.forEach((m) => {
        const card = clone(template),
          [first, name, meta] = C(card),
          [day, photo] = C(first);
        text(
          C(day)[0],
          date(m.snapshot.recorded_at, { day: "2-digit" }).replace("일", ""),
        );
        text(C(day)[1], date(m.snapshot.recorded_at, { weekday: "long" }));
        if (m.photos.length) fillPhoto(photo, m, m.photos[0], 0);
        else photo.remove();
        text(name, title(m));
        text(
          meta,
          "녹음 " +
            minutes(m) +
            (m.photos.length ? " · 사진 " + m.photos.length + "장" : ""),
        );
        card.removeAttribute("href");
        card.classList.add("memory-card");
        card.style.borderColor =
          m.id === selected ? "var(--accent)" : "transparent";
        card.setAttribute("aria-current", m.id === selected ? "true" : "false");
        name.classList.add("memory-card-title");
        touch(
          card,
          () => go(native && !m.saved ? "carreview" : "cardetail", m.id),
          title(m),
        );
        const footer = document.createElement("div");
        footer.className = "memory-footer";
        const state = document.createElement("span");
        text(state, memorySyncLabel(m));
        const summary = document.createElement("div");
        summary.append(meta, state);
        footer.append(
          summary,
          iconButton(`${title(m)} 옵션`, dotsSvg, () => memoryOptions(m)),
        );
        card.append(footer);
        target.append(card);
      });
    }
    populate(grid, current[1]);

    if (previous) {
      text(C(older)[0], previous[0]);
      text(C(older)[1], `일기 ${previous[1].length}개`);
      populate(olderGrid, previous[1]);
    } else {
      older.remove();
      olderGrid.remove();
    }
    const navs = head.querySelectorAll("button");
    action(navs[0], () => {
      monthOffset = Math.min(groups.length - 1, monthOffset + 1);
      render();
    });
    action(navs[1], () => {
      monthOffset = Math.max(0, monthOffset - 1);
      render();
    });
  }
  function fillCarDetail(root, m) {
    const [story, media] = C(C(root)[1]),
      [header, name, body] = C(story);
    text(
      C(header)[1],
      date(m.snapshot.recorded_at, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }) +
        " · " +
        m.snapshot.speaker,
    );
    text(name, title(m));
    touch(name, () => edit(m), "일기 편집");
    const p = clone(C(body)[0]);
    body.replaceChildren();
    (paragraphs(m).length
      ? paragraphs(m)
      : [m.snapshot.text || "녹음을 글로 옮겨 일기를 만들어 보세요."]
    ).forEach((s) => {
      const line = clone(p);
      text(line, s);
      body.append(line);
    });
    if (native) {
      const diaryHtml = body.innerHTML,
        tabs = document.createElement("div");
      tabs.className = "original-tabs";
      const read = document.createElement("button"),
        original = document.createElement("button");
      read.type = original.type = "button";
      text(read, "일기 읽기");
      text(original, "원래 이야기");
      read.setAttribute("aria-pressed", "true");
      original.setAttribute("aria-pressed", "false");
      action(read, () => {
        body.classList.remove("original-timeline");
        body.innerHTML = diaryHtml;
        read.setAttribute("aria-pressed", "true");
        original.setAttribute("aria-pressed", "false");
      });
      action(original, () => {
        fillTimeline(body, m);
        read.setAttribute("aria-pressed", "false");
        original.setAttribute("aria-pressed", "true");
      });
      tabs.append(read, original);
      story.insertBefore(tabs, body);
    }
    const menu = iconButton("일기 옵션", dotsSvg, () => memoryOptions(m));
    menu.style.marginLeft = "auto";
    header.append(menu);
    const [photosRow, , voice] = C(media);
    photosRow.classList.add("car-photo-row");
    C(photosRow).forEach((e, i) => {
      if (m.photos.length > 0 && !m.photos[i]) e.remove();
      else fillPhoto(e, m, m.photos[i], i);
    });
    C(C(voice)[0])[1].dataset.time = "combined";
    C(voice)[2].dataset.playLabel = "true";
    action(C(voice)[2], () => toggle(m));
    C(voice)[3].dataset.narrate = "true";
    action(C(voice)[3], async () => {
      await bridge("tts", {memoryId:m.id});
      window.nativeStatus(await bridge("state"));
    });
    const playbackNotice = document.createElement("p");
    playbackNotice.dataset.playbackNotice = "true";
    playbackNotice.setAttribute("role", "status");
    playbackNotice.className = "playback-notice";
    voice.append(playbackNotice);
    makeWave(C(voice)[1], m);
    playlistControls(voice);
  }
  async function start() {
    if (!native) {
      showError(Error("녹음은 차량 앱에서 시작해 주세요."));
      return;
    }
    await bridge("start");
  }
  let levels = Array(20).fill(0);
  let lastRecording = false;
  function drawInputLevel(level, paused) {
    const wave = app.querySelector("[data-input-wave]");
    if (!wave) return;
    if (paused) levels.fill(0);
    else {
      levels.shift();
      levels.push(Math.max(0, Math.min(1, level || 0)));
    }
    C(wave).forEach((bar, i) => (bar.style.height = `${4 + levels[i] * (Number(wave.dataset.amplitude) || 68)}px`));
    wave.setAttribute(
      "aria-label",
      paused
        ? "녹음 일시정지"
        : level > 0.02
          ? "음성 입력 중"
          : "음성 입력 대기",
    );
  }
  function fillRecording(root) {
    const [left, right] = C(C(root)[1]);
    const timer = left.querySelector("[data-recording-timer]");
    timer.dataset.timer = "true";
    text(timer, stamp(vehicleState.elapsed || 0));
    const wave = left.querySelector("[data-recording-wave]");
    if (wave) {
      wave.removeAttribute("aria-hidden");
      wave.dataset.inputWave = "true";
      wave.classList.add("input-wave");
      wave.replaceChildren(
        ...levels.map(() => {
          const bar = document.createElement("span");
          return bar;
        }),
      );
      drawInputLevel(vehicleState.level, vehicleState.paused);
    }
    const badge = C(left)[0];
    tail(badge, vehicleState.paused ? "일시정지" : "녹음 중");
    const info = C(C(left)[1]).at(-1);
    tail(info, "녹음 원본을 이 기기에 저장하고 있어요");
    C(right)
      .slice(1)
      .forEach((x) => x.remove());
    right.classList.add("recording-story");
    const note = document.createElement("div");
    note.dataset.liveTranscript = "true";
    note.className = "recording-lines";
    right.append(note);
    info.dataset.liveStatus = "true";
    paintLiveTranscript(vehicleState.stt_text);
    const buttons = left.querySelectorAll("button,a");
    action(buttons[0], () => bridge("pauseCapture"));
    tail(buttons[0], vehicleState.paused ? "이어서 녹음" : "잠깐 멈춤");
    tail(buttons[1], "끝내고 일기 만들기");
    action(buttons[1], () => bridge("finish"));
  }
  function listenIcon(kind) {
    const paths = {
      previous: '<path d="M5 5v14M19 5 9 12l10 7Z"/>',
      next: '<path d="M19 5v14M5 5l10 7-10 7Z"/>',
      play: '<path d="m8 5 11 7-11 7Z"/>',
      pause: '<path d="M8 5v14M16 5v14"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    };
    return `<svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`;
  }
  let visibleVehicleMode=null, modeAnimation=null, listenCommandsPending=0;
  function animateVehicleMode(root,mode) {
    const changed=visibleVehicleMode!==null&&visibleVehicleMode!==mode;
    visibleVehicleMode=mode;
    if(!changed)return;
    modeAnimation?.cancel();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    root.dataset.modeTransition=mode;
    modeAnimation=root.animate([
      {opacity:.28,transform:`translateX(${mode==='driving'?20:-20}px)`},
      {opacity:1,transform:'translateX(0)'},
    ],{duration:220,easing:'cubic-bezier(.2,.75,.25,1)'});
    const clear=()=>delete root.dataset.modeTransition;
    modeAnimation.onfinish=clear;modeAnimation.oncancel=clear;
  }
  async function listenRequest(command,values) {
    if(listenCommandsPending && values.action!=="listenExit")return;
    listenCommandsPending++;document.body.dataset.listenPending='true';
    try {await bridge(command,values);window.nativeStatus(await bridge("state"));}
    finally {listenCommandsPending--;if(!listenCommandsPending)delete document.body.dataset.listenPending;}
  }
  // Shared native audio state; mode changes never retain a parked content snapshot.
  function paintDriving(state) {
    if (page !== "cardriving" || !app.querySelector("[data-driving-surface]")) {
      window.suspendForDriving();
      page = "cardriving";
      const root = document.createElement("div");
      root.dataset.page = page;
      root.dataset.drivingSurface = "true";
      app.replaceChildren(root);
      viewport();
    }
    window.DiaryDriving.render(app.firstElementChild, state, {
      action, drive, stamp, paintConnection,
      resetWave(wave, count) {
        levels = Array(count).fill(0);
        wave.replaceChildren(...levels.map(() => document.createElement("span")));
      },
      drawWave: drawInputLevel,
      page: request => bridge("listenPage",request),
      select: memoryId => listenRequest("listenAction",{action:"listenSelect",memoryId}),
    });
    animateVehicleMode(app.firstElementChild,"driving");
  }
  async function drive(action) {
    if(action.startsWith("listen"))return listenRequest("driveAction",{action});
    await bridge("driveAction", { action });
    window.nativeStatus(await bridge("state"));
  }
  function paintLiveTranscript(value) {
    const list=app.querySelector("[data-live-transcript]");
    if(!list)return;
    if(!list.dataset.follow){
      list.dataset.follow="true";
      const follow=document.createElement("button");follow.className="transcript-follow";follow.textContent="최신 문장으로";follow.hidden=true;list.after(follow);
      let userIntent=false;
      for(const event of ["wheel","touchstart","pointerdown","keydown"])list.addEventListener(event,()=>{userIntent=true},{passive:true});
      list.tabIndex=0;list.setAttribute("aria-label","인식된 이야기 전체");
      list.addEventListener("scroll",()=>{
        if(!userIntent)return;
        const bottom=list.scrollHeight-list.clientHeight-list.scrollTop<24;
        list.dataset.follow=String(bottom);follow.hidden=bottom;
      },{passive:true});
      follow.onclick=()=>{list.dataset.follow="true";list.scrollTop=list.scrollHeight;follow.hidden=true;userIntent=false;};
    }
    if(list.dataset.value===(value||""))return;
    const follow=list.dataset.follow==="true",oldTop=list.scrollTop;
    list.dataset.value=value||"";
    const lines=(value||"").trim().split(/(?<=[.!?。！？])\s+|\n+/).filter(Boolean);
    list.replaceChildren();
    if(!lines.length){const empty=document.createElement("p");empty.className="recording-empty";text(empty,"편하게 이야기해 주세요.");list.append(empty);return;}
    lines.forEach((line,index)=>{const block=document.createElement("div");block.className="recording-line"+(index===lines.length-1?" latest":"");const body=document.createElement("p");text(body,line);block.append(body);list.append(block);});
    list.scrollTop=follow?list.scrollHeight:oldTop;
  }
  window.nativeStatus = (state) => {
    window.DiaryTheme?.native(state);
    const wasPaused = vehicleState.paused;
    vehicleState = state;
    observeNativeSync(state);
    if (state.driving) {
      paintDriving(state);
      return;
    }
    updatePlaylist(state);
    if (state.settings) window.DiarySettings?.update(state.settings);
    app
      .querySelectorAll("[data-sync-state]")
      .forEach((el) => paintConnection(el,!!vehicleState.paired));
    const notice = app.querySelector("[data-playback-notice]");
    if (notice) text(notice, state.playback_notice || "");
    if (state.recording && !lastRecording) levels.fill(0);
    lastRecording = state.recording;
    if (reference) return;
    if (page === "recording" && state.recording && wasPaused !== state.paused) {
      void render();
      return;
    }
    if (state.recording && page !== "recording") {
      go("recording", null);
      return;
    }
    if (
      page === "recording" &&
      !state.recording &&
      state.memoryId &&
      state.memoryId === state.stt_memory
    ) {
      selected = state.memoryId;
      page = "";
      go("carreview", state.memoryId);
      return;
    }
    const timer = app.querySelector("[data-timer]");
    if (timer) text(timer, stamp(state.elapsed || 0));
    paintLiveTranscript(state.stt_text);
    const liveStatus = app.querySelector("[data-live-status]");
    if (liveStatus)
      tail(
        liveStatus,
        state.paused
          ? "녹음을 잠시 멈췄어요"
          : state.stt_status?.includes("실패") ||
              state.stt_status?.includes("지연")
            ? "원본은 저장 중이에요 · 음성 인식을 확인해 주세요"
            : "대화를 글로 바꾸고 원본을 보관하고 있어요",
      );
    updateReviewState();
    drawInputLevel(state.level, state.paused || !state.recording);
    updateAudio(state);
  };
  let parkedReviewDraft = null;
  window.suspendForDriving = () => {
    const input = app.querySelector("[data-review-text]"),
      member = app.querySelector("[data-member]");
    if (input && member)
      parkedReviewDraft = {
        id: selected,
        text: input.value,
        member: member.value,
      };
    generation++;
    cancelAnimationFrame(playbackFrame);
    document.querySelectorAll("dialog").forEach((d) => d.close());
    app.replaceChildren();
  };
  let pendingRefresh = false;
  window.refreshNative = (safe = false) => {
    if (reference) return;
    if (
      safe &&
      (!["carhome", "carlist", "cardetail"].includes(page) ||
        document.querySelector("dialog[open]"))
    ) {
      pendingRefresh = true;
      return;
    }
    pendingRefresh = false;
    void render();
  };
  document.addEventListener(
    "close",
    () => {
      if (
        pendingRefresh &&
        !document.querySelector("dialog[open]") &&
        ["carhome", "carlist", "cardetail"].includes(page)
      )
        window.refreshNative(true);
    },
    true,
  );
  window.restoreNativeView = (next, id) => {
    selected = id;
    const target = "#" + next + (id ? "?id=" + encodeURIComponent(id) : "");
    if (location.hash === target) void render();
    else location.hash = target;
  };
  window.openNativeLibrary = () => {
    selected = null;
    page = "";
    go("carlist", null);
  };
  window.captureFailed = (message) => {
    page = "";
    go("carhome", null);
    showError(Error(message));
  };
  window.openNativeReview = (id) => {
    selected = id;
    page = "";
    go("carreview", id);
  };
  window.openNativeMemory = (id) => {
    selected = id;
    page = "";
    go("cardetail", id);
  };
  window.CHAGOK_TEMPLATES.carreview = `<div class="review-screen">${window.CHAGOK_TEMPLATES.cardetail.match(/<nav[\s\S]*?<\/nav>/)[0]}<div class="review-layout"><section class="review-editor"><header><button class="icon-button" aria-label="일기 목록으로">←</button><h1>확인할 이야기</h1></header><p data-review-status role="status"></p><label>함께 이야기한 사람<input data-member maxlength="40" placeholder="예: 우리 가족" /></label><label class="review-text-label">문장 수정<textarea data-review-text placeholder="녹음한 이야기를 글로 옮기고 있어요"></textarea></label><div class="review-actions"><button data-retry>원본 다시 인식</button><button data-create class="primary">일기로 만들기</button></div></section><aside class="review-preview"><h2>일기 미리보기</h2><div data-draft>이야기를 확인하고 ‘일기로 만들기’를 눌러 주세요.</div><button data-original>녹음 원본 듣기</button><button data-save class="primary" hidden>일기 저장</button></aside></div></div>`;
  let reviewDirty = false,
    reviewSubmitting = false;
  function updateReviewState() {
    const root = app.querySelector('[data-page="carreview"]');
    if (!root) return;
    const input = root.querySelector("[data-review-text]"),
      member = root.querySelector("[data-member]");
    const recognizing = !!vehicleState.stt_busy;
    if (
      !reviewDirty &&
      !record?.snapshot.text?.trim() &&
      !reviewSubmitting &&
      vehicleState.stt_memory === selected &&
      vehicleState.stt_text
    )
      input.value = vehicleState.stt_text;
    const status = root.querySelector("[data-review-status]");
    const failed =
      vehicleState.stt_memory === selected &&
      /실패|초과|미수신|지연|중단/.test(vehicleState.stt_status || "");
    status.hidden = !recognizing && !failed;
    text(
      status,
      recognizing
        ? "이야기를 글로 옮기고 있어요…"
        : failed
          ? "인식을 마치지 못했어요. 문장을 수정하거나 원본을 다시 인식할 수 있어요."
          : "",
    );
    root.querySelector("[data-retry]").hidden =
      recognizing || (!failed && !!input.value.trim());
    input.disabled = recognizing || reviewSubmitting;
    member.disabled = reviewSubmitting;
    root.querySelector("[data-create]").disabled =
      recognizing ||
      reviewSubmitting ||
      !input.value.trim() ||
      !member.value.trim();
    root.querySelector("[data-retry]").disabled =
      recognizing || reviewSubmitting;
    root.querySelector("[data-original]").disabled =
      recognizing || reviewSubmitting;
    root.querySelector("[data-save]").hidden =
      reviewDirty || !record?.draft_current;
    root.querySelector("[data-save]").disabled =
      recognizing || reviewSubmitting;
  }
  function fillReview(root, m) {
    reviewDirty = false;
    reviewSubmitting = false;
    const input = root.querySelector("[data-review-text]"),
      member = root.querySelector("[data-member]"),
      draftBox = root.querySelector("[data-draft]");
    input.value = m.snapshot.text;
    member.value =
      m.snapshot.speaker === "화자 확인 전"
        ? "우리 가족"
        : m.snapshot.speaker || "우리 가족";
    const showDraft = () => {
      draftBox.replaceChildren();
      if (!record.draft_current) {
        text(draftBox, "이야기를 확인하고 ‘일기로 만들기’를 눌러 주세요.");
        return;
      }
      for (const s of paragraphs(record)) {
        const p = document.createElement("p");
        text(p, s);
        draftBox.append(p);
      }
    };
    input.oninput = member.oninput = () => {
      reviewDirty = true;
      updateReviewState();
    };
    action(root.querySelector("header button"), () => go("carlist", null));
    action(root.querySelector("[data-original]"), () => toggle(m));
    action(root.querySelector("[data-retry]"), () =>
      bridge("retrySpeech", { memoryId: m.id }),
    );
    action(root.querySelector("[data-create]"), async () => {
      reviewSubmitting = true;
      updateReviewState();
      const btn = root.querySelector("[data-create]");
      text(btn, "일기를 만드는 중…");
      try {
        record = await bridge("createDiary", {
          memoryId: m.id,
          text: input.value,
          speaker: member.value,
        });
        reviewDirty = false;
        input.value = record.snapshot.text;
        member.value = record.snapshot.speaker;
        showDraft();
      } finally {
        reviewSubmitting = false;
        text(btn, "일기로 만들기");
        updateReviewState();
      }
    });
    action(root.querySelector("[data-save]"), async () => {
      reviewSubmitting = true;
      updateReviewState();
      try {
        await bridge("saveDiary", {
          memoryId: m.id,
          revision: record.snapshot.revision ?? record.revision,
          text: input.value,
          speaker: member.value,
        });
        reviewSubmitting = false;
        go("cardetail", m.id);
      } finally {
        reviewSubmitting = false;
        updateReviewState();
      }
    });
    if (parkedReviewDraft?.id === m.id) {
      input.value = parkedReviewDraft.text;
      member.value = parkedReviewDraft.member;
      reviewDirty =
        input.value !== m.snapshot.text || member.value !== m.snapshot.speaker;
      parkedReviewDraft = null;
    }
    showDraft();
    updateReviewState();
  }
  async function render() {
    const token = ++generation;
    if (native && vehicleState.driving) {
      paintDriving(vehicleState);
      return;
    }
    const [route, search] = location.hash.slice(1).split("?");
    page = window.CHAGOK_TEMPLATES[route] ? route : native ? "carhome" : "main";
    selected = new URLSearchParams(search || "").get("id") || selected;
    pauseAudio();
    app.innerHTML = window.CHAGOK_TEMPLATES[page];
    const root = app.firstElementChild;
    root.dataset.page = page;
    viewport();
    requestedLayout(root);
    if (reference) {
      document.title = "차곡 디자인 참조 · " + page;
      return;
    }
    root.style.visibility = "hidden";
    try {
      if (native) {
        vehicleState = await bridge("state");
        observeNativeSync(vehicleState);
        if (vehicleState.driving) {
          paintDriving(vehicleState);
          return;
        }
        await bridge("view", { page });
        window.DiaryTheme?.native(vehicleState);
      }
      if (["main", "carhome", "carlist"].includes(page))
        items = (
          native ? await bridge("list") : await api("sessions")
        ).items.sort((a, b) =>
          b.snapshot.recorded_at.localeCompare(a.snapshot.recorded_at),
        );
      if (["detail", "transcript", "cardetail", "carreview"].includes(page)) {
        if (!selected) throw Error("선택한 일기가 없어요.");
        record = native
          ? await bridge("read", { memoryId: selected })
          : await api("sessions/" + selected);
      }
      if (token !== generation) return false;
      if(!native&&!webSyncPrimed){if(["main"].includes(page))rememberWeb(items);else if(record)rememberWeb([record]);}
      if (page.startsWith("car") || page === "recording") {
        const template = document.createElement("template");
        template.innerHTML = window.DiaryVehicleRail;
        const rail = template.content.firstElementChild;
        const href =
          page === "carsettings"
            ? "#"
            : ["carhome", "recording"].includes(page)
              ? "CarHome.dc.html"
              : "CarList.dc.html";
        rail
          .querySelector(`a[href="${href}"]`)
          .setAttribute("aria-current", "page");
        root.querySelector("nav")?.replaceWith(rail);
      }
      nav(root);
      if (page === "main") await fillMobileList(root);
      if (page === "detail") fillDetail(root, record);
      if (page === "transcript") fillTranscript(root, record);
      if (page === "connect") await fillConnect(root);
      if (page === "carhome") fillCarHome(root);
      if (page === "carlist") fillCarList(root);
      if (page === "cardetail") fillCarDetail(root, record);
      if (page === "recording") fillRecording(root);
      if (page === "carreview") fillReview(root, record);
      if (page === "carsettings")
        await window.DiarySettings.render(root, {
          bridge,
          dialog,
          button,
          panelClose,
          selectTheme,
          showError,
        });
      themeShortcut(root);
      updatePlaylist(vehicleState);
      root.style.visibility = "visible";
      if(native)animateVehicleMode(root,"parked");
      return true;
    } catch (e) {
      if (token !== generation || vehicleState.driving) return;
      root.replaceChildren();
      root.style.visibility = "visible";
      showError(e);
      return false;
    }
  }
  let settingsReturn = "carhome";
  window.openNativeSettings = () => {
    if (page !== "carsettings") settingsReturn = page;
    go("carsettings");
  };
  window.settingsBack = () => {
    const d = document.querySelector("dialog[open]");
    if (d) d.close();
    else go(settingsReturn === "carsettings" ? "carhome" : settingsReturn);
  };
  window.addEventListener("hashchange", render);
  window.addEventListener("pagehide", () => {
    pauseAudio();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseAudio();
  });
  // Foreground SSE hints + durable cursor reads; no periodic data polling.
  let events = null,
    eventRetry = null,
    eventAttempt = 0,
    syncCursor = "0";
  let webSyncPending = false,
    webSyncBusy = false,
    applyTimer = null;
  async function receiveChanges() {
    if (
      !webSyncPending ||
      webSyncBusy ||
      document.hidden ||
      native ||
      reference
    )
      return;
    if (
      photoUploading ||
      !audio.paused ||
      document.querySelector("dialog[open]")
    ) {
      clearTimeout(applyTimer);
      applyTimer = setTimeout(receiveChanges, 500);
      return;
    }
    webSyncBusy = true;
    webSyncPending = false;
    const startCursor=syncCursor;
    try {
      const incoming=[];
      let result;
      do {
        result=await api("sync?cursor="+syncCursor);
        incoming.push(...result.items);syncCursor=result.cursor;
      } while(result.has_more);
      // A cursor replay or a device-only event is not a newly stored diary.
      const recordsChanged=webRecordsChanged(incoming);
      let changed=recordsChanged;
      if(["main","connect"].includes(page)) {
        const devices=await api("devices");
        changed ||= JSON.stringify(devices.devices)!==deviceFingerprint;
      }
      if(changed) {
        if(document.hidden||photoUploading||!audio.paused||document.querySelector("dialog[open]")) {
          syncCursor=startCursor;webSyncPending=true;return;
        }
        if(await render()!==true)throw Error("변경된 기록을 표시하지 못했어요.");
      }
      rememberWeb(incoming);
      if(webSyncPrimed&&recordsChanged)savedSyncNotice();
      webSyncPrimed=true;
    } catch {
      syncCursor=startCursor;
      syncConnectionStatus("연결을 확인해 주세요. 다시 연결되면 변경을 받아와요.");
    } finally {
      webSyncBusy=false;
      if(webSyncPending)void receiveChanges();
    }
  }
  function syncConnectionStatus(message) {
    let el = document.getElementById("sync-connection-status");
    if (!message) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("button");
      el.id = "sync-connection-status";
      el.style.cssText =
        "position:fixed;bottom:16px;left:16px;right:16px;z-index:80;padding:14px;border:0;border-radius:14px;background:#252A36;color:#fff;font:inherit";
      el.onclick = () => {
        syncCursor = "0";
        webSyncPending = true;
        void receiveChanges();
        stopEvents();
        startEvents();
      };
      document.body.append(el);
    }
    text(el, message + " · 새로고침");
  }
  function stopEvents() {
    events?.close();
    events = null;
    clearTimeout(eventRetry);
    clearTimeout(applyTimer);
  }
  function startEvents() {
    if (
      native ||
      reference ||
      document.hidden ||
      events ||
      typeof EventSource === "undefined"
    )
      return;
    const source = (events = new EventSource("/api/v1/events"));
    const opened = Date.now();
    const changed = () => {
      webSyncPending = true;
      void receiveChanges();
    };
    source.addEventListener("ready", () => {
      syncConnectionStatus("");
      changed();
    });
    source.addEventListener("changed", changed);
    source.addEventListener("unauthorized", () => {
      stopEvents();
      location.assign("/login");
    });
    source.onerror = () => {
      if (source !== events) return;
      stopEvents();
      if (Date.now() - opened > 20000) eventAttempt = 0;
      syncConnectionStatus("실시간 연결 재시도 중");
      eventRetry = setTimeout(
        startEvents,
        Math.min(32000, 1000 * 2 ** eventAttempt++) + Math.random() * 500,
      );
    };
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {stopEvents();document.querySelector('.sync-saved-notice')?.remove();clearTimeout(savedNoticeTimer);}
    else {
      webSyncPending = true;
      void receiveChanges();
      startEvents();
    }
  });
  window.addEventListener("online", () => {
    stopEvents();
    webSyncPending = true;
    void receiveChanges();
    startEvents();
  });
  window.addEventListener("pagehide", stopEvents);
  window.addEventListener("pageshow", startEvents);
  void render().then(startEvents);
})();
