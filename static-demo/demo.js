const caseList = document.getElementById('caseList');
const caseStage = document.getElementById('caseStage');
const emptyStage = document.getElementById('emptyStage');
const caseCount = document.getElementById('caseCount');
const viewTabs = document.getElementById('viewTabs');
const demoShell = document.querySelector('.demo-shell');

let cases = [];
let currentCase = null;
let currentView = 'original';
let flowData = null;
let flowTimers = [];

const heroCompare = document.getElementById('heroCompare');
const heroCompareRange = document.getElementById('heroCompareRange');
if (heroCompare && heroCompareRange) {
    heroCompareRange.addEventListener('input', event => {
        heroCompare.style.setProperty('--split', `${event.target.value}%`);
    });
}

function setText(id, value, fallback = '—') {
    document.getElementById(id).textContent = value || fallback;
}

function clearFlowTimers() {
    flowTimers.forEach(timer => window.clearTimeout(timer));
    flowTimers = [];
}

function fillFlowSelect(select, values, placeholder) {
    select.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    (Array.isArray(values) ? values : []).forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function resetFlowDemo() {
    clearFlowTimers();
    document.querySelectorAll('[data-flow-step]').forEach((step, index) => {
        step.classList.toggle('active', index === 0);
        step.classList.toggle('locked', index !== 0);
    });
    const analyze = document.getElementById('flowAnalyze');
    analyze.disabled = false;
    analyze.textContent = '开始空间分析';
    document.getElementById('flowAnalysisLocked').hidden = false;
    document.getElementById('flowAnalysisContent').hidden = true;
    document.getElementById('flowOutputLocked').hidden = false;
    document.getElementById('flowGenerating').hidden = true;
    document.getElementById('flowOutputContent').hidden = true;
    document.getElementById('flowArea').value = '';
    document.getElementById('flowBudget').value = '';
    document.getElementById('flowGenerate').disabled = true;
}

function renderFlowDemo(flow) {
    const section = document.getElementById('flowDemo');
    if (!flow?.enabled || !flow?.images?.original || !flow?.images?.result) {
        section.hidden = true;
        return;
    }
    flowData = flow;
    section.hidden = false;
    setText('flowTitle', flow.title, '完整产品流程演示');
    setText('flowDescription', flow.description, '从空间识别到智能改造的完整流程。');
    setText('flowRoomState', flow.room_state, '房间状态已识别');
    setText('flowScore', flow.score, '—');
    setText('flowSummary', flow.summary, '暂无分析摘要。');
    document.getElementById('flowOriginalImage').src = flow.images.original;
    document.getElementById('flowResultImage').src = flow.images.result;
    const heroBefore = document.querySelector('.hero-compare .compare-before');
    const heroAfter = document.querySelector('.hero-compare .compare-after img');
    if (heroBefore) heroBefore.src = flow.images.original;
    if (heroAfter) heroAfter.src = flow.images.result;
    const items = document.getElementById('flowAnalysisItems');
    items.replaceChildren();
    (Array.isArray(flow.analysis_items) ? flow.analysis_items : []).forEach(item => {
        const card = document.createElement('article');
        const title = document.createElement('b');
        title.textContent = item.label;
        const copy = document.createElement('p');
        copy.textContent = item.value;
        card.append(title, copy);
        items.appendChild(card);
    });
    if (Array.isArray(flow.advice) && flow.advice.length) {
        const advice = document.createElement('article');
        advice.className = 'flow-advice-item';
        const title = document.createElement('b');
        title.textContent = '优化建议';
        const copy = document.createElement('p');
        copy.textContent = flow.advice.join('；');
        advice.append(title, copy);
        items.appendChild(advice);
    }
    fillFlowSelect(document.getElementById('flowArea'), flow.area_options, '请选择面积');
    fillFlowSelect(document.getElementById('flowBudget'), flow.budget_options, '请选择预算');
    resetFlowDemo();
}

function completeFlowAnalysis() {
    const upload = document.querySelector('[data-flow-step="upload"]');
    const analysis = document.querySelector('[data-flow-step="analysis"]');
    upload.classList.remove('active');
    analysis.classList.remove('locked');
    analysis.classList.add('active');
    const analyze = document.getElementById('flowAnalyze');
    analyze.textContent = '分析完成';
    document.getElementById('flowAnalysisLocked').hidden = true;
    document.getElementById('flowAnalysisContent').hidden = false;
}

function startFlowGeneration() {
    const output = document.querySelector('[data-flow-step="output"]');
    document.querySelector('[data-flow-step="analysis"]').classList.remove('active');
    output.classList.remove('locked');
    output.classList.add('active');
    document.getElementById('flowOutputLocked').hidden = true;
    document.getElementById('flowOutputContent').hidden = true;
    document.getElementById('flowGenerating').hidden = false;
    document.getElementById('flowGenerate').disabled = true;
    const progress = document.getElementById('flowProgressText');
    progress.textContent = '分析家具与动线…';
    flowTimers.push(window.setTimeout(() => { progress.textContent = '优化收纳与空间布局…'; }, 650));
    flowTimers.push(window.setTimeout(() => { progress.textContent = '完成光线与软装调整…'; }, 1250));
    flowTimers.push(window.setTimeout(() => {
        document.getElementById('flowGenerating').hidden = true;
        document.getElementById('flowOutputContent').hidden = false;
        setText('flowSelectedArea', document.getElementById('flowArea').value);
        setText('flowSelectedBudget', document.getElementById('flowBudget').value);
    }, 1900));
}

document.getElementById('flowAnalyze').addEventListener('click', () => {
    const button = document.getElementById('flowAnalyze');
    button.disabled = true;
    button.textContent = 'AI 正在分析…';
    flowTimers.push(window.setTimeout(completeFlowAnalysis, 850));
});
['flowArea', 'flowBudget'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        document.getElementById('flowGenerate').disabled = !(
            document.getElementById('flowArea').value && document.getElementById('flowBudget').value
        );
    });
});
document.getElementById('flowGenerate').addEventListener('click', startFlowGeneration);
document.getElementById('flowReset').addEventListener('click', resetFlowDemo);

function availableViews(caseItem) {
    const views = [];
    if (caseItem.images?.original) {
        views.push({id: 'original', name: '原始房间', image: caseItem.images.original, label: '改造前 · ORIGINAL SPACE'});
    }
    if (caseItem.images?.smart) {
        views.push({id: 'smart', name: '智能改造', image: caseItem.images.smart, label: '智能改造 · AI OPTIMIZATION'});
    }
    (Array.isArray(caseItem.styles) ? caseItem.styles : []).forEach((style, index) => {
        if (!style?.image) return;
        views.push({
            id: `style:${style.id || index}`,
            name: style.name || `风格方案 ${index + 1}`,
            image: style.image,
            label: `${style.name || `风格方案 ${index + 1}`} · STYLE TRANSFORMATION`,
        });
    });
    return views;
}

function renderCaseList() {
    caseList.replaceChildren();
    caseCount.textContent = String(cases.length).padStart(2, '0');
    cases.forEach((caseItem, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'case-button';
        button.classList.toggle('active', currentCase?.slot === caseItem.slot);
        const number = document.createElement('span');
        number.textContent = String(index + 1).padStart(2, '0');
        const copy = document.createElement('span');
        const title = document.createElement('b');
        title.textContent = caseItem.title || `空间案例 ${index + 1}`;
        const meta = document.createElement('small');
        meta.textContent = [caseItem.tag, caseItem.room_area].filter(Boolean).join(' · ');
        copy.append(title, meta);
        button.append(number, copy);
        button.addEventListener('click', () => selectCase(caseItem));
        caseList.appendChild(button);
    });
}

function renderView() {
    if (!currentCase) return;
    const views = availableViews(currentCase);
    if (!views.some(view => view.id === currentView)) currentView = views[0]?.id || 'original';
    viewTabs.replaceChildren();
    views.forEach(view => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = view.name;
        button.dataset.view = view.id;
        button.role = 'tab';
        button.classList.toggle('active', view.id === currentView);
        button.setAttribute('aria-selected', String(view.id === currentView));
        button.addEventListener('click', () => {
            currentView = view.id;
            renderView();
        });
        viewTabs.appendChild(button);
    });
    const selectedView = views.find(view => view.id === currentView) || views[0];
    if (!selectedView) return;
    const image = document.getElementById('caseImage');
    image.src = selectedView.image;
    image.alt = `${currentCase.title || '房间案例'}${selectedView.name}`;
    setText('viewLabel', selectedView.label);
    setText('viewIndex', `${String(views.indexOf(selectedView) + 1).padStart(2, '0')} / ${String(views.length).padStart(2, '0')}`);
}

function selectCase(caseItem) {
    currentCase = caseItem;
    currentView = 'original';
    setText('caseTag', caseItem.tag, 'SPACE CASE');
    setText('caseTitle', caseItem.title, '未命名空间案例');
    setText('caseArea', caseItem.room_area, '面积未记录');
    setText('caseState', caseItem.state_label, '房间状态未记录');
    setText('caseScore', caseItem.score, '—');
    setText('caseSummary', caseItem.summary, '暂无分析摘要。');
    const advice = document.getElementById('caseAdvice');
    advice.replaceChildren();
    const adviceItems = Array.isArray(caseItem.advice) && caseItem.advice.length
        ? caseItem.advice
        : ['暂无改造建议。'];
    adviceItems.forEach(item => {
        const listItem = document.createElement('li');
        listItem.textContent = item;
        advice.appendChild(listItem);
    });
    caseStage.hidden = false;
    if (emptyStage) emptyStage.hidden = true;
    if (demoShell) demoShell.hidden = false;
    renderView();
    renderCaseList();
}

async function initialize() {
    let flow = null;
    try {
        const [casesResponse, flowResponse] = await Promise.all([
            fetch('cases.json', {cache: 'no-store'}),
            fetch('flow.json', {cache: 'no-store'}),
        ]);
        if (!casesResponse.ok) throw new Error('cases unavailable');
        const data = await casesResponse.json();
        cases = (Array.isArray(data.items) ? data.items : []).filter(item => (
            item?.enabled && item?.images?.original
        ));
        if (flowResponse.ok) flow = await flowResponse.json();
    } catch (_error) {
        cases = [];
    }
    renderFlowDemo(flow);
    if (cases.length) selectCase(cases[0]);
    else {
        caseStage.hidden = true;
        if (emptyStage) emptyStage.hidden = false;
        if (demoShell) demoShell.hidden = true;
        renderCaseList();
    }
}

initialize();
