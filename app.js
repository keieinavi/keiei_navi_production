const DATA = {
  courseModels: [],
  questions: [],
  weights: [],
  weightMap: new Map(),
};

const STATE = {
  answers: new Map(),
};

const el = {
  top: document.getElementById("view-top"),
  quiz: document.getElementById("view-quiz"),
  result: document.getElementById("view-result"),

  btnStart: document.getElementById("btn-start"),
  btnBackTop: document.getElementById("btn-back-to-top"),
  btnToResult: document.getElementById("btn-to-result"),
  btnRetry: document.getElementById("btn-retry"),
  btnHome: document.getElementById("btn-home"),

  questions: document.getElementById("questions"),
  ranking: document.getElementById("ranking"),

  progressText: document.getElementById("progress-text"),
  progressRemaining: document.getElementById("progress-remaining"),
  progressFill: document.getElementById("progress-fill"),

  toast: document.getElementById("toast"),
};

function toast(msg) {
  el.toast.hidden = false;
  el.toast.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.toast.hidden = true), 2200);
}

function showView(viewName) {
  const views = [el.top, el.quiz, el.result];
  for (const v of views) v.classList.remove("is-active");

  const target = viewName === "top" ? el.top : viewName === "quiz" ? el.quiz : el.result;
  target.classList.add("is-active");


  if (window.gsap) {
    gsap.fromTo(target, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: "power2.out" });
  }
}

function parseCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadData() {
  // 相対パスなので、どのディレクトリに置いても動きやすい
  const [courseModels, questions, weights] = await Promise.all([
    parseCSV("./data/course_models.csv"),
    parseCSV("./data/questions.csv"),
    parseCSV("./data/weights.csv"),
  ]);

  DATA.courseModels = courseModels.map((r) => ({
    course_model_id: toInt(r.course_model_id),
    course_model_name: (r.course_model_name ?? "").trim(),
    description: (r.description ?? "").trim(),
    link_url: (r.link_url ?? "").trim(),
  }));

  DATA.questions = questions.map((r) => ({
    question_id: toInt(r.question_id),
    label: (r.label ?? "").trim(),
    text: (r.text ?? "").trim(),
  }));

  DATA.weights = weights.map((r) => ({
    course_model_id: toInt(r.course_model_id),
    question_id: toInt(r.question_id),
    weight: toNum(r.weight),
  }));

  DATA.weightMap.clear();
  for (const w of DATA.weights) {
    DATA.weightMap.set(`${w.course_model_id}:${w.question_id}`, w.weight);
  }
}

function renderQuestions() {
  el.questions.innerHTML = "";

  for (const q of DATA.questions) {
    const card = document.createElement("div");
    card.className = "q-card";
    card.dataset.qid = String(q.question_id);

    card.innerHTML = `
      <div class="q-head">
        <div class="q-label">${q.label}</div>
        <div class="q-text">${escapeHTML(q.text)}</div>
      </div>

      <div class="scale" role="radiogroup" aria-label="${q.label}">
        ${[5,4,3,2,1].map(v => {
          const id = `q${q.question_id}_${v}`;
          return `
            <label class="opt" for="${id}">
              <input id="${id}" type="radio" name="q_${q.question_id}" value="${v}" />
              <span>${v}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;

    card.querySelectorAll(`input[name="q_${q.question_id}"]`).forEach((input) => {
      input.addEventListener("change", () => {
        STATE.answers.set(q.question_id, toInt(input.value));
        card.classList.remove("q-error");
        updateProgress();
        updateResultButtonState();
      });
    });

    el.questions.appendChild(card);
  }

  updateProgress();
  updateResultButtonState();

  if (window.gsap) {
    gsap.fromTo(".q-card", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.03, ease: "power2.out" });
  }
}

function updateProgress() {
  const total = DATA.questions.length;
  const answered = STATE.answers.size;
  const remaining = total - answered;

  el.progressText.textContent = `${answered} / ${total}`;
  el.progressRemaining.textContent = `残り ${remaining}`;
  const pct = total === 0 ? 0 : (answered / total) * 100;
  el.progressFill.style.width = `${pct}%`;
}

function updateResultButtonState() {
  const ok = STATE.answers.size === DATA.questions.length && DATA.questions.length > 0;
  el.btnToResult.disabled = !ok;
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function computeScores() {
  const scores = DATA.courseModels.map((cm) => {
    let score = 0;
    for (const q of DATA.questions) {
      const a = STATE.answers.get(q.question_id);
      const w = DATA.weightMap.get(`${cm.course_model_id}:${q.question_id}`) ?? 0;
      score += (a ?? 0) * w;
    }
    return {
      course_model_id: cm.course_model_id,
      course_model_name: cm.course_model_name,
      link_url: cm.link_url,
      score,
    };
  });

  scores.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return x.course_model_id - y.course_model_id;
  });

  return scores;
}

function renderTop3(scores) {
  const top3 = scores.slice(0, 3);

  el.ranking.innerHTML = top3.map((r, idx) => {
    const rankLabel = `${idx + 1}位`;
    const link = r.link_url || "https://example.com/";
    return `
      <div class="rank-card">
        <div class="rank-top">
          <div class="badge">${idx + 1}</div>
          <div>
            <div class="rank-name">${escapeHTML(r.course_model_name || "（名称未設定）")}</div>
            <a class="rank-link" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">
              大学HPを見る（仮）
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (window.gsap) {
    gsap.fromTo(".rank-card", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.06, ease: "power2.out" });
  }
}

function resetAnswers() {
  STATE.answers.clear();
  el.questions.querySelectorAll("input[type=radio]").forEach((i) => (i.checked = false));
  updateProgress();
  updateResultButtonState();
}

function scrollToFirstMissing() {
  for (const q of DATA.questions) {
    if (!STATE.answers.has(q.question_id)) {
      const card = el.questions.querySelector(`.q-card[data-qid="${q.question_id}"]`);
      if (card) {
        card.classList.add("q-error");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      break;
    }
  }
}

async function init() {
  try {
    toast("データ読み込み中…");
    await loadData();
    renderQuestions();
    toast("準備OK");
  } catch (e) {
    console.error(e);
    toast("データ読み込みに失敗しました（dataフォルダ配置を確認）");
  }

  el.btnStart.addEventListener("click", () => showView("quiz"));

  el.btnBackTop.addEventListener("click", () => {
    resetAnswers();
    showView("top");
  });

  el.btnToResult.addEventListener("click", () => {
    if (STATE.answers.size !== DATA.questions.length) {
      scrollToFirstMissing();
      toast("未回答があります");
      return;
    }
    const scores = computeScores();
    renderTop3(scores);
    showView("result");
  });

  el.btnRetry.addEventListener("click", () => {
    resetAnswers();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showView("quiz");
  });

  el.btnHome.addEventListener("click", () => {
    resetAnswers();
    showView("top");
  });

  showView("top");
}

init();
