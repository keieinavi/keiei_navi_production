const CONFIG = {
  csv: {
    courseModels: "./data/course_models.csv",
    questions: "./data/questions.csv",
    weights: "./data/weights.csv",
  },
  scaleValues: [5, 4, 3, 2, 1],
  toastDurationMs: 2200,
  loadingDurationMs: 4000,
};

const DATA = {
  courseModels: [],
  questions: [],
  weights: [],
  weightMap: new Map(),
};

const STATE = {
  answers: new Map(),
  isLoading: false,
  loadingToken: 0,
};

function createDomRefs() {
  return {
    views: {
      top: document.getElementById("view-top"),
      quiz: document.getElementById("view-quiz"),
      loading: document.getElementById("view-loading"),
      result: document.getElementById("view-result"),
    },
    buttons: {
      start: document.getElementById("btn-start"),
      backToTop: document.getElementById("btn-back-to-top"),
      toResult: document.getElementById("btn-to-result"),
      retry: document.getElementById("btn-retry"),
      home: document.getElementById("btn-home"),
    },
    sections: {
      questions: document.getElementById("questions"),
      ranking: document.getElementById("ranking"),
    },
    progress: {
      text: document.getElementById("progress-text"),
      remaining: document.getElementById("progress-remaining"),
      fill: document.getElementById("progress-fill"),
    },
    feedback: {
      toast: document.getElementById("toast"),
      confirmModal: document.getElementById("confirm-modal"),
      confirmMessage: document.getElementById("confirm-message"),
      confirmCancel: document.getElementById("confirm-cancel"),
      confirmOk: document.getElementById("confirm-ok"),
    },
  };
}

const DOM = createDomRefs();

const Utils = {
  toInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  },
  toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },
  escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
};

const Animator = {
  get enabled() {
    return Boolean(window.gsap);
  },
  viewEnter(viewName, target) {
    if (!this.enabled || !target) return;
    gsap.fromTo(
      target,
      { autoAlpha: 0, y: 26, scale: 0.98, filter: "blur(8px)" },
      { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.55, ease: "power4.out" },
    );

    if (viewName === "top") {
      gsap.fromTo(
        "#view-top .intro-block, #view-top .notice, #view-top .diagnosis-tag, #view-top .actions .btn",
        { autoAlpha: 0, y: 24, scale: 0.95, rotate: -2 },
        { autoAlpha: 1, y: 0, scale: 1, rotate: 0, duration: 0.62, stagger: 0.08, ease: "back.out(1.8)" },
      );
    }

    if (viewName === "loading") {
      gsap.fromTo(
        "#view-loading .loading-wrap",
        { autoAlpha: 0, y: 24, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" },
      );
    }
  },
  questionCardsEnter() {
    if (!this.enabled) return;
    gsap.fromTo(
      ".q-card",
      { autoAlpha: 0, y: 40, rotateX: -14, scale: 0.92 },
      { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 0.72, stagger: 0.07, ease: "back.out(1.4)" },
    );
  },
  progressPulse(fillEl) {
    if (!this.enabled || !fillEl) return;
    gsap.fromTo(
      fillEl,
      { filter: "brightness(1.7)" },
      { filter: "brightness(1)", duration: 0.35, ease: "power2.out", overwrite: "auto" },
    );
  },
  answerFeedback(card, selectedOpt) {
    if (!this.enabled || !card) return;
    gsap.fromTo(
      card,
      { y: 0, scale: 1 },
      { y: -3, scale: 1.015, duration: 0.16, yoyo: true, repeat: 1, ease: "power2.out", overwrite: "auto" },
    );

    if (!selectedOpt) return;
    gsap.fromTo(
      selectedOpt,
      { rotate: 0 },
      { rotate: 2, duration: 0.1, yoyo: true, repeat: 1, ease: "sine.inOut", overwrite: "auto" },
    );
  },
  focusNextQuestion(card) {
    if (!this.enabled || !card) return;
    gsap.fromTo(
      card,
      { autoAlpha: 0.7, y: 26, scale: 0.95 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.7)", overwrite: "auto" },
    );
  },
  resultButtonPulse(btn) {
    if (!this.enabled || !btn) return;
    gsap.fromTo(
      btn,
      { scale: 1 },
      { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, ease: "power1.inOut", overwrite: "auto" },
    );
  },
  rankingEnter() {
    if (!this.enabled) return;
    gsap.fromTo(
      ".rank-card",
      { autoAlpha: 0, y: 26, rotate: -3, scale: 0.92 },
      { autoAlpha: 1, y: 0, rotate: 0, scale: 1, duration: 0.68, stagger: 0.12, ease: "back.out(1.6)" },
    );
  },
};

const ToastComponent = (() => {
  let timeoutId = 0;

  return {
    show(message) {
      const toastEl = DOM.feedback.toast;
      if (!toastEl) return;

      toastEl.hidden = false;
      toastEl.textContent = message;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        toastEl.hidden = true;
      }, CONFIG.toastDurationMs);
    },
  };
})();

const ConfirmComponent = {
  async open(message, options = {}) {
    const {
      okLabel = "進む",
      cancelLabel = "キャンセル",
    } = options;

    const {
      confirmModal: modal,
      confirmMessage: messageEl,
      confirmCancel: cancelBtn,
      confirmOk: okBtn,
    } = DOM.feedback;

    if (!modal || !messageEl || !cancelBtn || !okBtn) {
      return Promise.resolve(window.confirm(message));
    }

    return new Promise((resolve) => {
      messageEl.textContent = message;
      cancelBtn.textContent = cancelLabel;
      okBtn.textContent = okLabel;
      modal.hidden = false;
      document.body.classList.add("modal-open");
      requestAnimationFrame(() => modal.classList.add("is-visible"));

      const cleanup = () => {
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        window.removeEventListener("keydown", onKeydown);
      };

      const finalize = (result) => {
        cleanup();
        modal.classList.remove("is-visible");
        document.body.classList.remove("modal-open");
        setTimeout(() => {
          modal.hidden = true;
          resolve(result);
        }, 140);
      };

      const onOk = () => finalize(true);
      const onCancel = () => finalize(false);
      const onBackdrop = (ev) => {
        if (ev.target === modal) onCancel();
      };
      const onKeydown = (ev) => {
        if (ev.key === "Escape") onCancel();
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      window.addEventListener("keydown", onKeydown);
      cancelBtn.focus({ preventScroll: true });
    });
  },
};

const FLOW_CONFIRM_OPTIONS = Object.freeze({
  okLabel: "ok",
  cancelLabel: "cancel",
});

const FlowConfirmComponent = {
  ask(message) {
    return ConfirmComponent.open(message, FLOW_CONFIRM_OPTIONS);
  },
  askBack() {
    return this.ask("保存されませんが戻りますか");
  },
  askResult() {
    return this.ask("診断結果を確認しますか");
  },
};

const ViewComponent = {
  show(viewName) {
    const viewMap = DOM.views;
    for (const viewEl of Object.values(viewMap).filter(Boolean)) {
      viewEl.classList.remove("is-active");
    }

    const target = viewMap[viewName] ?? viewMap.top;
    target?.classList.add("is-active");
    Animator.viewEnter(viewName, target);
  },
};

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

const DataComponent = {
  async load() {
    const [courseModels, questions, weights] = await Promise.all([
      parseCSV(CONFIG.csv.courseModels),
      parseCSV(CONFIG.csv.questions),
      parseCSV(CONFIG.csv.weights),
    ]);

    DATA.courseModels = courseModels.map((row) => ({
      course_model_id: Utils.toInt(row.course_model_id),
      course_model_name: (row.course_model_name ?? "").trim(),
      description: (row.description ?? "").trim(),
      link_url: (row.link_url ?? "").trim(),
    }));

    DATA.questions = questions.map((row) => ({
      question_id: Utils.toInt(row.question_id),
      label: (row.label ?? "").trim(),
      text: (row.text ?? "").trim(),
    }));

    DATA.weights = weights.map((row) => ({
      course_model_id: Utils.toInt(row.course_model_id),
      question_id: Utils.toInt(row.question_id),
      weight: Utils.toNum(row.weight),
    }));

    DATA.weightMap.clear();
    for (const weight of DATA.weights) {
      DATA.weightMap.set(`${weight.course_model_id}:${weight.question_id}`, weight.weight);
    }
  },
};

const ProgressComponent = {
  update() {
    const total = DATA.questions.length;
    const answered = STATE.answers.size;
    const remaining = total - answered;
    const progress = total === 0 ? 0 : (answered / total) * 100;

    DOM.progress.text.textContent = `${answered} / ${total}`;
    DOM.progress.remaining.textContent = `残り ${remaining}`;
    DOM.progress.fill.style.width = `${progress}%`;
    Animator.progressPulse(DOM.progress.fill);
  },
};

const ResultButtonComponent = {
  syncState() {
    const btn = DOM.buttons.toResult;
    if (!btn) return;

    if (STATE.isLoading) {
      btn.disabled = true;
      return;
    }

    const isAllAnswered = DATA.questions.length > 0 && STATE.answers.size === DATA.questions.length;
    btn.disabled = !isAllAnswered;
  },
};

const QuestionComponent = {
  render() {
    const container = DOM.sections.questions;
    if (!container) return;

    container.innerHTML = "";
    for (const question of DATA.questions) {
      container.appendChild(this.createCard(question));
    }

    ProgressComponent.update();
    ResultButtonComponent.syncState();
    Animator.questionCardsEnter();
  },

  createCard(question) {
    const card = document.createElement("div");
    card.className = "q-card";
    card.dataset.qid = String(question.question_id);

    const optionsHTML = CONFIG.scaleValues.map((value) => {
      const optionId = `q${question.question_id}_${value}`;
      return `
        <label class="opt" for="${optionId}">
          <input id="${optionId}" type="radio" name="q_${question.question_id}" value="${value}" />
          <span>${value}</span>
        </label>
      `;
    }).join("");

    card.innerHTML = `
      <div class="q-head">
        <div class="q-label">${question.label}</div>
        <div class="q-text">${Utils.escapeHTML(question.text)}</div>
      </div>
      <div class="scale" role="radiogroup" aria-label="${question.label}">
        ${optionsHTML}
      </div>
    `;

    this.bindOptionEvents(card, question.question_id);
    return card;
  },

  bindOptionEvents(card, questionId) {
    card.querySelectorAll(`input[name="q_${questionId}"]`).forEach((input) => {
      input.addEventListener("change", () => {
        const selectedOpt = input.closest(".opt");
        this.reflectSelectedOption(card, selectedOpt);

        STATE.answers.set(questionId, Utils.toInt(input.value));
        card.classList.remove("q-error");

        ProgressComponent.update();
        ResultButtonComponent.syncState();
        Animator.answerFeedback(card, selectedOpt);
        this.scrollToNext(questionId);
      });
    });
  },

  reflectSelectedOption(card, selectedOpt) {
    card.querySelectorAll(".opt").forEach((opt) => {
      opt.classList.remove("is-selected", "is-picked");
    });

    if (!selectedOpt) return;
    selectedOpt.classList.add("is-selected");
    void selectedOpt.offsetWidth;
    selectedOpt.classList.add("is-picked");
  },

  scrollToNext(currentQuestionId) {
    const currentIndex = DATA.questions.findIndex((question) => question.question_id === currentQuestionId);
    if (currentIndex < 0) return;

    const nextQuestion = DATA.questions[currentIndex + 1];
    if (!nextQuestion) {
      DOM.buttons.toResult?.scrollIntoView({ behavior: "smooth", block: "center" });
      Animator.resultButtonPulse(DOM.buttons.toResult);
      return;
    }

    const nextCard = DOM.sections.questions?.querySelector(`.q-card[data-qid="${nextQuestion.question_id}"]`);
    if (!nextCard) return;

    DOM.sections.questions?.querySelectorAll(".q-card.is-focused").forEach((card) => {
      card.classList.remove("is-focused");
    });

    nextCard.scrollIntoView({ behavior: "smooth", block: "center" });
    nextCard.classList.add("is-focused");
    clearTimeout(this._focusTimeout);
    this._focusTimeout = setTimeout(() => {
      nextCard.classList.remove("is-focused");
    }, 500);

    Animator.focusNextQuestion(nextCard);
  },

  reset() {
    STATE.answers.clear();
    DOM.sections.questions?.querySelectorAll("input[type=radio]").forEach((input) => {
      input.checked = false;
    });

    DOM.sections.questions?.querySelectorAll(".q-card").forEach((card) => {
      card.classList.remove("q-error", "is-focused");
    });

    DOM.sections.questions?.querySelectorAll(".scale .opt").forEach((opt) => {
      opt.classList.remove("is-selected", "is-picked");
    });

    ProgressComponent.update();
    ResultButtonComponent.syncState();
  },

  focusFirstMissing() {
    for (const question of DATA.questions) {
      if (STATE.answers.has(question.question_id)) continue;

      const card = DOM.sections.questions?.querySelector(`.q-card[data-qid="${question.question_id}"]`);
      if (card) {
        card.classList.add("q-error");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      break;
    }
  },
};

const ResultComponent = {
  computeScores() {
    const scores = DATA.courseModels.map((model) => {
      let score = 0;
      for (const question of DATA.questions) {
        const answer = STATE.answers.get(question.question_id);
        const weight = DATA.weightMap.get(`${model.course_model_id}:${question.question_id}`) ?? 0;
        score += (answer ?? 0) * weight;
      }

      return {
        course_model_id: model.course_model_id,
        course_model_name: model.course_model_name,
        link_url: model.link_url,
        score,
      };
    });

    scores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.course_model_id - b.course_model_id;
    });

    return scores;
  },

  render(scores) {
    const top3 = scores.slice(0, 3);
    const container = DOM.sections.ranking;
    if (!container) return;

    container.innerHTML = top3.map((row, index) => {
      const rank = index + 1;
      const link = row.link_url || "https://example.com/";

      return `
        <div class="rank-card rank-${rank}">
          <div class="rank-top">
            <div class="badge" aria-label="${rank}位">${rank}</div>
            <div class="rank-main">
              <div class="rank-name">${Utils.escapeHTML(row.course_model_name || "（名称未設定）")}</div>
            </div>
            <a class="rank-action" href="${Utils.escapeHTML(link)}" target="_blank" rel="noopener noreferrer">
              詳細※別サイトに飛びます
            </a>
          </div>
        </div>
      `;
    }).join("");

    Animator.rankingEnter();
  },
};

const LoadingComponent = {
  cancel() {
    STATE.loadingToken += 1;
    STATE.isLoading = false;
    document.body.classList.remove("is-analyzing");
  },

  async showThenResult(scores) {
    const token = ++STATE.loadingToken;
    STATE.isLoading = true;
    ResultButtonComponent.syncState();

    document.body.classList.add("is-analyzing");
    ViewComponent.show("loading");
    Utils.scrollToTop();

    await Utils.wait(CONFIG.loadingDurationMs);
    if (token !== STATE.loadingToken) return;

    ResultComponent.render(scores);
    ViewComponent.show("result");
    STATE.isLoading = false;
    document.body.classList.remove("is-analyzing");
    ResultButtonComponent.syncState();
  },
};

function bindClick(element, handler) {
  if (!element) return;
  element.addEventListener("click", handler);
}

const App = {
  async init() {
    try {
      ToastComponent.show("データ読み込み中…");
      await DataComponent.load();
      QuestionComponent.render();
      ToastComponent.show("準備OK");
    } catch (error) {
      console.error(error);
      ToastComponent.show("データ読み込みに失敗しました（dataフォルダ配置を確認）");
    }

    this.bindEvents();
    ViewComponent.show("top");
  },

  bindEvents() {
    bindClick(DOM.buttons.start, () => {
      ViewComponent.show("quiz");
      Utils.scrollToTop();
    });

    bindClick(DOM.buttons.backToTop, async () => {
      const shouldBack = await FlowConfirmComponent.askBack();
      if (!shouldBack) return;

      LoadingComponent.cancel();
      QuestionComponent.reset();
      ViewComponent.show("top");
      Utils.scrollToTop();
    });

    bindClick(DOM.buttons.toResult, async () => {
      if (STATE.isLoading) return;
      if (STATE.answers.size !== DATA.questions.length) {
        QuestionComponent.focusFirstMissing();
        ToastComponent.show("未回答があります");
        return;
      }

      const isFinalAnswer = await FlowConfirmComponent.askResult();
      if (!isFinalAnswer) return;

      const scores = ResultComponent.computeScores();
      await LoadingComponent.showThenResult(scores);
    });

    bindClick(DOM.buttons.retry, () => {
      LoadingComponent.cancel();
      QuestionComponent.reset();
      ViewComponent.show("quiz");
      Utils.scrollToTop();
    });

    bindClick(DOM.buttons.home, () => {
      LoadingComponent.cancel();
      QuestionComponent.reset();
      ViewComponent.show("top");
      Utils.scrollToTop();
    });
  },
};

App.init();
