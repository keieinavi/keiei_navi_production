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

const VIEW_NAME = Object.freeze({
  top: "top",
  quiz: "quiz",
  loading: "loading",
  result: "result",
});

const SCALE_HINTS = Object.freeze({
  5: ["とても", "そう思う"],
  3: ["どちらでも", "ない"],
  1: ["そう思わない"],
});

const FLOW_CONFIRM_OPTIONS = Object.freeze({
  okLabel: "ok",
  cancelLabel: "cancel",
});

const DATA_STORE = {
  courseModels: [],
  questions: [],
  weightMap: new Map(),
};

const APP_STATE = {
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

const NumberComponent = {
  toInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  },
  toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },
  roundScore(value) {
    return Math.round(value * 1e12) / 1e12;
  },
};

const TextComponent = {
  escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },

  toWordBreakHTML(value) {
    const text = String(value ?? "");
    if (!text) return "";

    if (typeof Intl?.Segmenter !== "function") {
      return this.escapeHTML(text);
    }

    const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
    const segments = Array.from(segmenter.segment(text), ({ segment }) => segment);
    const chunks = [];
    let current = "";

    const shouldBreakAfter = (segment, nextSegment) => {
      if (!nextSegment) return true;
      if (/^\s+$/u.test(segment)) return true;
      if (/^[、。,.!?！？・…:：;；「」『』（）()［］【】]$/u.test(segment)) return true;
      if (/^(は|が|を|に|で|と|へ|も|や|の|な|か|ね|よ|ぞ|さ|わ|から|まで|より|って|ので|ため|です|ます)$/u.test(segment)) return true;
      if (/^[A-Za-z0-9]+$/u.test(segment) && !/^[A-Za-z0-9]+$/u.test(nextSegment)) return true;
      return false;
    };

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const nextSegment = segments[index + 1] ?? "";
      current += segment;

      if (shouldBreakAfter(segment, nextSegment)) {
        chunks.push(current);
        current = "";
      }
    }

    if (current) chunks.push(current);

    const compacted = [];
    const isTinyKana = (chunk) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]{1,2}$/u.test(chunk);
    const isOnlyPunctuation = (chunk) => /^[、。,.!?！？・…:：;；]+$/u.test(chunk);

    for (const chunk of chunks) {
      if (!compacted.length) {
        compacted.push(chunk);
        continue;
      }

      if (isTinyKana(chunk) || isOnlyPunctuation(chunk)) {
        compacted[compacted.length - 1] += chunk;
        continue;
      }

      compacted.push(chunk);
    }

    return compacted.map((chunk) => this.escapeHTML(chunk)).join("<wbr>");
  },
};

const ScrollComponent = {
  toTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

const CsvComponent = {
  parse(url) {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data),
        error: (err) => reject(err),
      });
    });
  },

  normalizeCourseModels(rows) {
    return rows.map((row) => ({
      course_model_id: NumberComponent.toInt(row.course_model_id),
      course_model_name: (row.course_model_name ?? "").trim(),
      link_url: (row.link_url ?? "").trim(),
    }));
  },

  normalizeQuestions(rows) {
    return rows.map((row) => ({
      question_id: NumberComponent.toInt(row.question_id),
      label: (row.label ?? "").trim(),
      text: (row.text ?? "").trim(),
    }));
  },

  buildWeightMap(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const courseModelId = NumberComponent.toInt(row.course_model_id);
      const questionId = NumberComponent.toInt(row.question_id);
      const weight = NumberComponent.toNum(row.weight);
      map.set(`${courseModelId}:${questionId}`, weight);
    });
    return map;
  },

  async loadAll() {
    const [courseRows, questionRows, weightRows] = await Promise.all([
      this.parse(CONFIG.csv.courseModels),
      this.parse(CONFIG.csv.questions),
      this.parse(CONFIG.csv.weights),
    ]);

    return {
      courseModels: this.normalizeCourseModels(courseRows),
      questions: this.normalizeQuestions(questionRows),
      weightMap: this.buildWeightMap(weightRows),
    };
  },
};

const StoreComponent = {
  setData({ courseModels, questions, weightMap }) {
    DATA_STORE.courseModels = courseModels;
    DATA_STORE.questions = questions;
    DATA_STORE.weightMap = weightMap;
  },

  getCourseModels() {
    return DATA_STORE.courseModels;
  },

  getQuestions() {
    return DATA_STORE.questions;
  },

  getWeight(courseModelId, questionId) {
    return DATA_STORE.weightMap.get(`${courseModelId}:${questionId}`) ?? 0;
  },

  getAnsweredCount() {
    return APP_STATE.answers.size;
  },

  getTotalQuestionCount() {
    return DATA_STORE.questions.length;
  },

  isAllAnswered() {
    return this.getTotalQuestionCount() > 0 && this.getAnsweredCount() === this.getTotalQuestionCount();
  },

  setAnswer(questionId, value) {
    APP_STATE.answers.set(questionId, value);
  },

  getAnswer(questionId) {
    return APP_STATE.answers.get(questionId);
  },

  resetAnswers() {
    APP_STATE.answers.clear();
  },

  isLoading() {
    return APP_STATE.isLoading;
  },

  startLoading() {
    APP_STATE.loadingToken += 1;
    APP_STATE.isLoading = true;
    return APP_STATE.loadingToken;
  },

  cancelLoading() {
    APP_STATE.loadingToken += 1;
    APP_STATE.isLoading = false;
  },

  finishLoading() {
    APP_STATE.isLoading = false;
  },

  isActiveLoadingToken(token) {
    return token === APP_STATE.loadingToken;
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

    if (viewName === VIEW_NAME.top) {
      gsap.fromTo(
        "#view-top .intro-block, #view-top .notice, #view-top .diagnosis-tag, #view-top .actions .btn",
        { autoAlpha: 0, y: 24, scale: 0.95, rotate: -2 },
        { autoAlpha: 1, y: 0, scale: 1, rotate: 0, duration: 0.62, stagger: 0.08, ease: "back.out(1.8)" },
      );
    }

    if (viewName === VIEW_NAME.loading) {
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

  resultButtonPulse(button) {
    if (!this.enabled || !button) return;

    gsap.fromTo(
      button,
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
    const { okLabel = "進む", cancelLabel = "キャンセル" } = options;

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
      messageEl.innerHTML = TextComponent.toWordBreakHTML(message);
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

const FlowConfirmComponent = {
  askBack() {
    return ConfirmComponent.open("保存されませんが戻りますか", FLOW_CONFIRM_OPTIONS);
  },
};

const ViewComponent = {
  show(viewName) {
    for (const viewEl of Object.values(DOM.views).filter(Boolean)) {
      viewEl.classList.remove("is-active");
    }

    const target = DOM.views[viewName] ?? DOM.views.top;
    target?.classList.add("is-active");
    Animator.viewEnter(viewName, target);
  },
};

const DataComponent = {
  async load() {
    const data = await CsvComponent.loadAll();
    StoreComponent.setData(data);
  },
};

const ProgressComponent = {
  update() {
    const total = StoreComponent.getTotalQuestionCount();
    const answered = StoreComponent.getAnsweredCount();
    const progress = total === 0 ? 0 : (answered / total) * 100;

    if (DOM.progress.text) {
      DOM.progress.text.textContent = `${answered} / ${total}`;
    }

    if (DOM.progress.fill) {
      DOM.progress.fill.style.width = `${progress}%`;
      Animator.progressPulse(DOM.progress.fill);
    }
  },
};

const ResultButtonComponent = {
  syncState() {
    const button = DOM.buttons.toResult;
    if (!button) return;

    button.disabled = StoreComponent.isLoading();
  },
};

const TemplateComponent = {
  buildScaleHintHTML(value) {
    const hintLines = SCALE_HINTS[value] ?? [];
    if (!hintLines.length) return "";

    const text = hintLines.map((line) => TextComponent.toWordBreakHTML(line)).join("<br>");
    return `<small class="opt-hint">${text}</small>`;
  },

  buildScaleOptionHTML(questionId, value) {
    const optionId = `q${questionId}_${value}`;
    const hintHTML = this.buildScaleHintHTML(value);

    return `
      <label class="opt" for="${optionId}">
        <input id="${optionId}" type="radio" name="q_${questionId}" value="${value}" />
        <span class="opt-value">${value}</span>
        ${hintHTML}
      </label>
    `;
  },

  buildQuestionCardHTML(question) {
    const optionsHTML = CONFIG.scaleValues
      .map((value) => this.buildScaleOptionHTML(question.question_id, value))
      .join("");

    return `
      <div class="q-head">
        <div class="q-label">${question.label}</div>
        <div class="q-text">${TextComponent.toWordBreakHTML(question.text)}</div>
      </div>
      <div class="scale" role="radiogroup" aria-label="${question.label}">
        ${optionsHTML}
      </div>
    `;
  },

  buildRankCardHTML(row, rank) {
    const link = row.link_url || "https://www.kyoto-su.ac.jp/new_bu/#:~:text=%E5%AE%89%E5%BF%83%E3%81%AE,%E3%82%B3%E3%83%BC%E3%82%B9%E3%83%A2%E3%83%87%E3%83%AB";
    const courseName = row.course_model_name || "（名称未設定）";

    return `
      <div class="rank-card rank-${rank}">
        <div class="rank-top">
          <div class="badge" aria-label="${rank}位">${rank}</div>
          <div class="rank-main">
            <div class="rank-name">${TextComponent.toWordBreakHTML(courseName)}</div>
          </div>
          <a class="rank-action" href="${TextComponent.escapeHTML(link)}" target="_blank" rel="noopener noreferrer">
            詳細※<wbr>別サイトに飛びます
          </a>
        </div>
      </div>
    `;
  },
};

const QuestionComponent = {
  focusTimeoutId: 0,

  render() {
    const container = DOM.sections.questions;
    if (!container) return;

    container.innerHTML = "";
    StoreComponent.getQuestions().forEach((question) => {
      container.appendChild(this.createCard(question));
    });

    ProgressComponent.update();
    ResultButtonComponent.syncState();
    Animator.questionCardsEnter();
  },

  createCard(question) {
    const card = document.createElement("div");
    card.className = "q-card";
    card.dataset.qid = String(question.question_id);
    card.innerHTML = TemplateComponent.buildQuestionCardHTML(question);
    this.bindOptionEvents(card, question.question_id);
    this.restoreAnsweredState(card, question.question_id);
    return card;
  },

  restoreAnsweredState(card, questionId) {
    const answer = StoreComponent.getAnswer(questionId);
    if (answer == null) return;

    const selected = card.querySelector(`input[name="q_${questionId}"][value="${answer}"]`);
    if (!selected) return;

    selected.checked = true;
    this.reflectSelectedOption(card, selected.closest(".opt"));
    card.classList.add("is-answered");
  },

  bindOptionEvents(card, questionId) {
    card.querySelectorAll(`input[name="q_${questionId}"]`).forEach((input) => {
      input.addEventListener("change", () => {
        const isMissingFlowActive = Boolean(
          DOM.sections.questions?.querySelector(".q-card.is-missing-target"),
        );
        const selectedOpt = input.closest(".opt");
        this.reflectSelectedOption(card, selectedOpt);

        StoreComponent.setAnswer(questionId, NumberComponent.toInt(input.value));
        card.classList.remove("is-missing-target");
        card.classList.add("is-answered");

        ProgressComponent.update();
        ResultButtonComponent.syncState();
        Animator.answerFeedback(card, selectedOpt);
        this.navigateAfterAnswer(questionId, isMissingFlowActive);
      });
    });
  },

  navigateAfterAnswer(currentQuestionId, isMissingFlowActive) {
    if (isMissingFlowActive) {
      const nextMissingCard = this.findFirstMissingTargetCard();
      if (nextMissingCard) {
        this.focusCard(nextMissingCard, 600);
        return;
      }

      DOM.buttons.toResult?.scrollIntoView({ behavior: "smooth", block: "center" });
      Animator.resultButtonPulse(DOM.buttons.toResult);
      return;
    }

    this.scrollToNext(currentQuestionId);
  },

  findFirstMissingTargetCard() {
    return DOM.sections.questions?.querySelector(".q-card.is-missing-target") ?? null;
  },

  focusCard(card, durationMs = 500) {
    DOM.sections.questions?.querySelectorAll(".q-card.is-focused").forEach((item) => {
      item.classList.remove("is-focused");
    });

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("is-focused");
    clearTimeout(this.focusTimeoutId);
    this.focusTimeoutId = setTimeout(() => {
      card.classList.remove("is-focused");
    }, durationMs);
    Animator.focusNextQuestion(card);
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
    const questions = StoreComponent.getQuestions();
    const currentIndex = questions.findIndex((question) => question.question_id === currentQuestionId);
    if (currentIndex < 0) return;

    const nextQuestion = questions[currentIndex + 1];
    if (!nextQuestion) {
      DOM.buttons.toResult?.scrollIntoView({ behavior: "smooth", block: "center" });
      Animator.resultButtonPulse(DOM.buttons.toResult);
      return;
    }

    const nextCard = DOM.sections.questions?.querySelector(`.q-card[data-qid="${nextQuestion.question_id}"]`);
    if (!nextCard) return;

    this.focusCard(nextCard, 500);
  },

  reset() {
    StoreComponent.resetAnswers();

    DOM.sections.questions?.querySelectorAll("input[type=radio]").forEach((input) => {
      input.checked = false;
    });

    DOM.sections.questions?.querySelectorAll(".q-card").forEach((card) => {
      card.classList.remove("is-missing-target", "is-focused", "is-answered");
    });

    DOM.sections.questions?.querySelectorAll(".scale .opt").forEach((opt) => {
      opt.classList.remove("is-selected", "is-picked");
    });

    clearTimeout(this.focusTimeoutId);
    ProgressComponent.update();
    ResultButtonComponent.syncState();
  },

  focusFirstMissing() {
    DOM.sections.questions?.querySelectorAll(".q-card.is-missing-target").forEach((card) => {
      card.classList.remove("is-missing-target");
    });
    DOM.sections.questions?.querySelectorAll(".q-card.is-focused").forEach((card) => {
      card.classList.remove("is-focused");
    });

    let firstMissingCard = null;
    for (const question of StoreComponent.getQuestions()) {
      if (StoreComponent.getAnswer(question.question_id) != null) continue;

      const card = DOM.sections.questions?.querySelector(`.q-card[data-qid="${question.question_id}"]`);
      if (card) {
        card.classList.add("is-missing-target");
        if (!firstMissingCard) firstMissingCard = card;
      }
    }

    if (!firstMissingCard) return;

    this.focusCard(firstMissingCard, 600);
  },
};

const ScoreComponent = {
  compute() {
    const models = StoreComponent.getCourseModels();
    const questions = StoreComponent.getQuestions();

    const scores = models.map((model) => {
      let score = 0;
      questions.forEach((question) => {
        const answer = StoreComponent.getAnswer(question.question_id) ?? 0;
        const weight = StoreComponent.getWeight(model.course_model_id, question.question_id);
        score += answer * weight;
      });
      score = NumberComponent.roundScore(score);

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
};

const ResultComponent = {
  render(scores) {
    const container = DOM.sections.ranking;
    if (!container) return;

    container.innerHTML = scores
      .slice(0, 3)
      .map((row, index) => TemplateComponent.buildRankCardHTML(row, index + 1))
      .join("");

    Animator.rankingEnter();
  },
};

const LoadingComponent = {
  cancel() {
    StoreComponent.cancelLoading();
    document.body.classList.remove("is-analyzing");
  },

  async showThenResult(scores) {
    const token = StoreComponent.startLoading();
    ResultButtonComponent.syncState();

    document.body.classList.add("is-analyzing");
    ViewComponent.show(VIEW_NAME.loading);
    ScrollComponent.toTop();

    await ScrollComponent.wait(CONFIG.loadingDurationMs);
    if (!StoreComponent.isActiveLoadingToken(token)) return;

    ResultComponent.render(scores);
    ViewComponent.show(VIEW_NAME.result);
    StoreComponent.finishLoading();
    document.body.classList.remove("is-analyzing");
    ResultButtonComponent.syncState();
  },
};

const FlowComponent = {
  show(viewName) {
    ViewComponent.show(viewName);
    ScrollComponent.toTop();
  },

  resetQuizAndShow(viewName) {
    LoadingComponent.cancel();
    QuestionComponent.reset();
    this.show(viewName);
  },
};

function bindClick(element, handler) {
  if (!element) return;
  element.addEventListener("click", handler);
}

const App = {
  async init() {
    try {
      await DataComponent.load();
      QuestionComponent.render();
    } catch (error) {
      console.error(error);
      ToastComponent.show("データ読み込みに失敗しました（dataフォルダ配置を確認）");
    }

    this.bindEvents();
    ViewComponent.show(VIEW_NAME.top);
  },

  bindEvents() {
    bindClick(DOM.buttons.start, () => {
      FlowComponent.show(VIEW_NAME.quiz);
    });

    bindClick(DOM.buttons.backToTop, async () => {
      const shouldBack = await FlowConfirmComponent.askBack();
      if (!shouldBack) return;
      FlowComponent.resetQuizAndShow(VIEW_NAME.top);
    });

    bindClick(DOM.buttons.toResult, async () => {
      if (StoreComponent.isLoading()) return;
      if (!StoreComponent.isAllAnswered()) {
        QuestionComponent.focusFirstMissing();
        ToastComponent.show("未回答があります");
        return;
      }

      const scores = ScoreComponent.compute();
      await LoadingComponent.showThenResult(scores);
    });

    bindClick(DOM.buttons.retry, () => {
      FlowComponent.resetQuizAndShow(VIEW_NAME.quiz);
    });

    bindClick(DOM.buttons.home, () => {
      FlowComponent.resetQuizAndShow(VIEW_NAME.top);
    });
  },
};

App.init();
