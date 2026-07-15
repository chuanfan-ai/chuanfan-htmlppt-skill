/* Chuanfan HTMLPPT editor core. Keep this file as the single JS source of truth. */
(async function(){
  'use strict';
  if(window.__CHUANFAN_HTMLPPT_EDITOR__) return;

  const VERSION = '4.0.0';
  const SCHEMA = 4;
  const MAX_PAGE_HISTORY = 30;
  const MAX_DECK_HISTORY = 20;
  const DEFAULT_SERVICE = 'http://127.0.0.1:17777';
  const SCRIPT_PATH = '<SKILL_ROOT>/scripts/local-edit-server.py';
  const body = document.body;
  const slides = [...document.querySelectorAll('.slide')];
  let editing = false;

  const interactiveSelector = 'input,textarea,select,button,[contenteditable="true"],[role="dialog"]';
  window.__htmlPptEditorActive = () => editing;
  window.__htmlPptEditorShouldYield = event => {
    const target = event?.target instanceof Element ? event.target : null;
    return editing || !!target?.closest(interactiveSelector);
  };

  if(!slides.length){
    window.__CHUANFAN_HTMLPPT_EDITOR__ = {version:VERSION, schema:SCHEMA, ready:false};
    return;
  }

  const clone = value => {
    if(typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const nowIso = () => new Date().toISOString();
  const nowLabel = () => new Date().toLocaleString('zh-CN', {hour12:false});
  const scope = `${location.protocol}//${location.host}${location.pathname || '/deck'}`;
  const keySuffix = scope.replace(/[^a-zA-Z0-9._:/-]/g, '_');
  const keys = {
    current:`chuanfan-htmlppt-current-v${SCHEMA}:${keySuffix}`,
    saved:`chuanfan-htmlppt-saved-v${SCHEMA}:${keySuffix}`,
    baseline:`chuanfan-htmlppt-baseline-v${SCHEMA}:${keySuffix}`,
    history:`chuanfan-htmlppt-history-v${SCHEMA}:${keySuffix}`,
    service:'chuanfan-htmlppt-editor-service-url'
  };
  const sourceRevision = document.documentElement.dataset.sourceRevision
    || document.querySelector('meta[name="htmlppt-source-revision"]')?.content
    || 'unversioned';

  const readJson = (key, fallback=null) => {
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch{return fallback;}
  };
  let quotaExported = false;
  const writeJson = (key, value) => {
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(error){
      if(!quotaExported){
        quotaExported = true;
        setTimeout(()=>downloadPackage('htmlppt-user-state-storage-fallback.json'), 0);
      }
      toast('浏览器存储失败，已导出状态文件。');
      return false;
    }
  };

  slides.forEach((slide, index)=>{
    if(!slide.dataset.slideId) slide.dataset.slideId = `slide-${index + 1}`;
    if(!slide.dataset.title){
      const heading = slide.querySelector('h1,h2,h3');
      slide.dataset.title = heading?.textContent?.trim().slice(0, 80) || `第 ${index + 1} 页`;
    }
  });

  const textSelector = [
    '[data-editable]', 'h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote', 'figcaption',
    '.lead', '.kicker', '.t-meta', '.t-cat', '.quote-large', '.stat-label', '.stat-nb',
    '.stat-note', '.media-caption', '.chrome-min .l', '.chrome-min .r', '.bullet-list div',
    '.case-card', '.method-card', '.prompt-box', 'pre', 'code'
  ].join(',');
  const textNodes = [];
  const imageNodes = [];
  let textIndex = 0;
  let imageIndex = 0;
  slides.forEach(slide=>{
    const candidates = [...slide.querySelectorAll(textSelector)].filter(node=>{
      if(node.closest('.cf-editor-toolbar,.cf-editor-panel,.cf-edit-layer')) return false;
      if(node.closest('[data-no-edit]')) return false;
      if(node.tagName === 'CODE' && node.closest('pre')) return false;
      return true;
    });
    candidates.forEach(node=>{
      if(!node.dataset.editId) node.dataset.editId = `text-${textIndex}`;
      textIndex += 1;
      node.dataset.editKind = 'text';
      textNodes.push(node);
    });
    [...slide.querySelectorAll('img[src]')].forEach(node=>{
      if(node.closest('.cf-editor-toolbar,.cf-editor-panel,.cf-edit-layer')) return;
      if(!node.dataset.editId) node.dataset.editId = `image-${imageIndex}`;
      imageIndex += 1;
      node.dataset.editKind = 'image';
      imageNodes.push(node);
    });
  });

  const nodeMap = new Map([...textNodes, ...imageNodes].map(node=>[node.dataset.editId, node]));
  const slideForNode = node => node.closest('.slide');
  const pageIdForNode = node => slideForNode(node)?.dataset.slideId;

  function sourceElementRecord(node){
    const kind = node.dataset.editKind;
    return {
      id:node.dataset.editId,
      kind,
      html:kind === 'text' ? node.innerHTML : undefined,
      src:kind === 'image' ? node.getAttribute('src') : undefined,
      alt:kind === 'image' ? (node.getAttribute('alt') || '') : undefined,
      display:node.style.display || '',
      fontSize:node.style.fontSize || '',
      color:node.style.color || '',
      whiteSpace:node.style.whiteSpace || '',
      dx:0,
      dy:0,
      scale:1,
      deleted:false
    };
  }

  function captureSource(){
    const pages = {};
    slides.forEach(slide=>{
      const pageId = slide.dataset.slideId;
      pages[pageId] = {id:pageId, title:slide.dataset.title, elements:{}, overlays:[]};
    });
    [...textNodes, ...imageNodes].forEach(node=>{
      const pageId = pageIdForNode(node);
      if(pageId && pages[pageId]) pages[pageId].elements[node.dataset.editId] = sourceElementRecord(node);
    });
    return {schema:SCHEMA, sourceRevision, createdAt:nowIso(), pages};
  }

  const sourceBaseline = captureSource();
  function mergeBaseline(stored, source){
    if(!stored?.pages) return clone(source);
    const merged = clone(stored);
    merged.schema = SCHEMA;
    Object.entries(source.pages).forEach(([pageId, page])=>{
      if(!merged.pages[pageId]) merged.pages[pageId] = clone(page);
      else{
        merged.pages[pageId].title ||= page.title;
        merged.pages[pageId].elements ||= {};
        Object.entries(page.elements).forEach(([id, record])=>{
          if(!merged.pages[pageId].elements[id]) merged.pages[pageId].elements[id] = clone(record);
        });
        if(!Array.isArray(merged.pages[pageId].overlays)) merged.pages[pageId].overlays = [];
      }
    });
    return merged;
  }
  let baseline = mergeBaseline(readJson(keys.baseline), sourceBaseline);
  writeJson(keys.baseline, baseline);

  function mergeCurrent(stored, source){
    const merged = clone(source);
    merged.schema = SCHEMA;
    merged.sourceRevision = sourceRevision;
    merged.updatedAt = stored?.updatedAt || nowIso();
    merged.savedAt = stored?.savedAt || null;
    merged.dirty = !!stored?.dirty;
    if(!stored?.pages) return merged;
    Object.entries(stored.pages).forEach(([pageId, page])=>{
      if(!merged.pages[pageId]) merged.pages[pageId] = {id:pageId,title:page.title || pageId,elements:{},overlays:[]};
      merged.pages[pageId].title = page.title || merged.pages[pageId].title;
      merged.pages[pageId].elements = {...merged.pages[pageId].elements, ...(clone(page.elements || {}))};
      merged.pages[pageId].overlays = clone(Array.isArray(page.overlays) ? page.overlays : []);
    });
    return merged;
  }

  function legacyState(edits, overlays){
    const migrated = clone(sourceBaseline);
    migrated.schema = SCHEMA;
    migrated.sourceRevision = sourceRevision;
    migrated.updatedAt = nowIso();
    migrated.savedAt = nowIso();
    migrated.dirty = false;
    Object.entries(edits || {}).forEach(([id, value])=>{
      const node = nodeMap.get(id);
      const pageId = node ? pageIdForNode(node) : null;
      if(!pageId || !migrated.pages[pageId]?.elements[id]) return;
      if(value?.type === 'html') migrated.pages[pageId].elements[id].html = value.value;
      if(value?.type === 'image') migrated.pages[pageId].elements[id].src = value.value;
    });
    Object.entries(overlays || {}).forEach(([index, items])=>{
      const slide = slides[Number(index)];
      if(!slide || !Array.isArray(items)) return;
      migrated.pages[slide.dataset.slideId].overlays = items.map(item=>({
        id:item.id || `overlay-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type:item.type === 'image' ? 'image' : 'text',
        text:item.text || '双击编辑文字', src:item.src || '', alt:item.alt || '新增图片',
        x:Number(item.x ?? 14), y:Number(item.y ?? 18), w:Number(item.w ?? 30), h:Number(item.h ?? 12),
        fontSize:Number(item.fontSize ?? 28), color:item.color || '#090909', nowrap:!!item.nowrap,
        z:Number(item.z || Date.now()), deleted:false
      }));
    });
    return migrated;
  }

  const legacyPath = location.pathname || 'deck';
  const legacyEdits = readJson('chuanfan-htmlppt-editor-edits:' + legacyPath, {});
  const legacyOverlays = readJson('chuanfan-htmlppt-editor-overlays:' + legacyPath, {});
  let storedCurrent = readJson(keys.current);
  if(!storedCurrent && (Object.keys(legacyEdits).length || Object.keys(legacyOverlays).length)){
    storedCurrent = legacyState(legacyEdits, legacyOverlays);
  }

  async function readDiskPackage(){
    if(location.protocol === 'file:') return null;
    try{
      const response = await fetch('htmlppt-user-state.json', {cache:'no-store'});
      if(!response.ok) return null;
      const data = await response.json();
      return data?.format === 'chuanfan-htmlppt-state' ? data : null;
    }catch{return null;}
  }
  const diskPackage = await readDiskPackage();
  const diskCurrent = diskPackage?.current;
  if(diskCurrent && (!storedCurrent || Date.parse(diskCurrent.updatedAt || 0) > Date.parse(storedCurrent.updatedAt || 0))){
    storedCurrent = diskCurrent;
  }
  let state = mergeCurrent(storedCurrent, sourceBaseline);
  let lastSaved = mergeCurrent(readJson(keys.saved) || diskPackage?.lastSaved || state, sourceBaseline);
  let history = readJson(keys.history, diskPackage?.history || {schema:SCHEMA,page:{},deck:[]});
  if(!history || typeof history !== 'object') history = {schema:SCHEMA,page:{},deck:[]};
  history.schema = SCHEMA;
  history.page ||= {};
  history.deck = Array.isArray(history.deck) ? history.deck : [];

  const legacyHistory = readJson('chuanfan-htmlppt-editor-history:' + legacyPath, []);
  if(!history.deck.length && Array.isArray(legacyHistory) && legacyHistory.length){
    history.deck = legacyHistory.slice(0, MAX_DECK_HISTORY).map(item=>({
      id:item.id || `legacy-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title:item.title || '旧版历史迁移', createdAt:item.createdAt || nowIso(), scope:'deck',
      data:legacyState(item.edits || {}, item.overlays || {})
    }));
  }

  let serviceUrl = readJson(keys.service, null) || localStorage.getItem(keys.service) || DEFAULT_SERVICE;
  let selected = null;
  let imageAction = 'add';
  let debounceTimer = null;
  let toastTimer = null;

  const toastEl = document.createElement('div');
  toastEl.className = 'cf-editor-toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  function toast(message){
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>toastEl.classList.remove('show'), 2200);
  }

  const currentSlideIndex = () => clamp(Number(window.__currentSlideIndex || 0), 0, slides.length - 1);
  const currentSlide = () => slides[currentSlideIndex()];
  const currentPageId = () => currentSlide()?.dataset.slideId;
  const currentPage = () => state.pages[currentPageId()];
  const pageTitle = pageId => state.pages[pageId]?.title || pageId;

  function persistHistory(){
    Object.keys(history.page).forEach(pageId=>{
      history.page[pageId] = (history.page[pageId] || []).slice(0, MAX_PAGE_HISTORY);
    });
    history.deck = history.deck.slice(0, MAX_DECK_HISTORY);
    writeJson(keys.history, history);
  }
  function persistDraft(){
    state.schema = SCHEMA;
    state.sourceRevision = sourceRevision;
    state.updatedAt = nowIso();
    state.dirty = true;
    writeJson(keys.current, state);
  }
  function scheduleDraft(){
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(persistDraft, 120);
  }

  function elementRecord(id){
    const node = nodeMap.get(id);
    const pageId = node ? pageIdForNode(node) : null;
    return pageId ? state.pages[pageId]?.elements?.[id] : null;
  }
  function applyOriginal(node){
    const pageId = pageIdForNode(node);
    const record = state.pages[pageId]?.elements?.[node.dataset.editId];
    if(!record) return;
    node.style.display = record.deleted ? 'none' : (record.display || '');
    if(record.kind === 'text') node.innerHTML = record.html ?? '';
    if(record.kind === 'image'){
      if(record.src) node.setAttribute('src', record.src);
      if(record.alt !== undefined) node.setAttribute('alt', record.alt);
      node.style.objectFit ||= 'contain';
    }
    node.style.fontSize = record.fontSize || '';
    node.style.color = record.color || '';
    node.style.whiteSpace = record.whiteSpace || '';
    const slide = slideForNode(node);
    const width = slide?.clientWidth || innerWidth;
    const height = slide?.clientHeight || innerHeight;
    node.style.translate = `${(Number(record.dx || 0) / 100) * width}px ${(Number(record.dy || 0) / 100) * height}px`;
    node.style.scale = String(clamp(Number(record.scale || 1), .5, 2));
    node.style.transformOrigin = 'top left';
  }
  function applyAllOriginals(){
    [...textNodes, ...imageNodes].forEach(applyOriginal);
  }

  function ensureLayer(slide){
    let layer = slide.querySelector(':scope > .cf-edit-layer');
    if(!layer){
      layer = document.createElement('div');
      layer.className = 'cf-edit-layer';
      slide.appendChild(layer);
    }
    return layer;
  }
  function overlayFor(pageId, overlayId){
    return state.pages[pageId]?.overlays?.find(item=>item.id === overlayId);
  }
  function renderPageOverlays(pageId){
    const slide = slides.find(item=>item.dataset.slideId === pageId);
    if(!slide || !state.pages[pageId]) return;
    const layer = ensureLayer(slide);
    layer.innerHTML = '';
    state.pages[pageId].overlays.forEach(item=>{
      if(item.deleted) return;
      const wrap = document.createElement('div');
      wrap.className = 'cf-overlay-item';
      wrap.dataset.overlayId = item.id;
      wrap.dataset.pageId = pageId;
      wrap.dataset.editKind = item.type;
      Object.assign(wrap.style, {
        left:`${clamp(Number(item.x || 0), 0, 98)}%`, top:`${clamp(Number(item.y || 0), 0, 96)}%`,
        width:`${clamp(Number(item.w || 20), 2, 100)}%`, height:`${clamp(Number(item.h || 10), 2, 100)}%`,
        zIndex:String(item.z || 1)
      });
      if(item.type === 'image'){
        const image = document.createElement('img');
        image.className = 'cf-overlay-image';
        image.src = item.src;
        image.alt = item.alt || '新增图片';
        wrap.appendChild(image);
      }else{
        const text = document.createElement('div');
        text.className = 'cf-overlay-text';
        text.innerHTML = item.text || '双击编辑文字';
        text.contentEditable = editing ? 'true' : 'false';
        text.style.fontSize = `${clamp(Number(item.fontSize || 28), 12, 160)}px`;
        text.style.color = item.color || '#090909';
        text.style.whiteSpace = item.nowrap ? 'nowrap' : 'normal';
        text.addEventListener('input', ()=>{
          item.text = text.innerHTML;
          scheduleDraft();
        });
        wrap.appendChild(text);
      }
      layer.appendChild(wrap);
    });
  }
  function renderAllOverlays(){
    Object.keys(state.pages).forEach(renderPageOverlays);
  }

  const selectionBox = document.createElement('div');
  selectionBox.className = 'cf-selection-box';
  selectionBox.innerHTML = '<div class="cf-selection-label"></div><div class="cf-move-handle" title="拖动"></div><div class="cf-resize-handle" title="缩放"></div>';
  const selectionLabel = selectionBox.querySelector('.cf-selection-label');
  const moveHandle = selectionBox.querySelector('.cf-move-handle');
  const resizeHandle = selectionBox.querySelector('.cf-resize-handle');

  function selectedNode(){
    if(!selected) return null;
    if(selected.type === 'original') return nodeMap.get(selected.id) || null;
    return slides.find(slide=>slide.dataset.slideId === selected.pageId)
      ?.querySelector(`.cf-overlay-item[data-overlay-id="${CSS.escape(selected.id)}"]`) || null;
  }
  function selectedKind(){
    if(!selected) return null;
    if(selected.type === 'original') return elementRecord(selected.id)?.kind || null;
    return overlayFor(selected.pageId, selected.id)?.type || null;
  }
  function updateSelectionBox(){
    const node = selectedNode();
    if(!editing || !selected || !node || getComputedStyle(node).display === 'none'){
      selectionBox.classList.remove('active');
      return;
    }
    const slide = slideForNode(node) || slides.find(item=>item.dataset.slideId === selected.pageId);
    if(!slide) return;
    if(selectionBox.parentElement !== slide) slide.appendChild(selectionBox);
    const rect = node.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    Object.assign(selectionBox.style, {
      left:`${rect.left - slideRect.left}px`, top:`${rect.top - slideRect.top}px`,
      width:`${rect.width}px`, height:`${rect.height}px`
    });
    selectionLabel.textContent = `${selectedKind() === 'image' ? '图片' : '文字'} · ${selected.id}`;
    selectionBox.classList.add('active');
    updateToolState();
  }
  function clearSelection(){
    selected = null;
    selectionBox.classList.remove('active');
    updateToolState();
  }
  function selectOriginal(node){
    selected = {type:'original', pageId:pageIdForNode(node), id:node.dataset.editId};
    updateSelectionBox();
  }
  function selectOverlay(node){
    selected = {type:'overlay', pageId:node.dataset.pageId, id:node.dataset.overlayId};
    updateSelectionBox();
  }

  function beginHandleDrag(event, mode){
    if(!editing || !selected) return;
    event.preventDefault();
    event.stopPropagation();
    const node = selectedNode();
    const slide = node ? (slideForNode(node) || slides.find(item=>item.dataset.slideId === selected.pageId)) : null;
    if(!node || !slide) return;
    const slideRect = slide.getBoundingClientRect();
    const start = {x:event.clientX, y:event.clientY};
    const originalRecord = selected.type === 'original' ? elementRecord(selected.id) : null;
    const overlayRecord = selected.type === 'overlay' ? overlayFor(selected.pageId, selected.id) : null;
    const initial = clone(originalRecord || overlayRecord);
    const nodeRect = node.getBoundingClientRect();
    const onMove = moveEvent=>{
      const dxPx = moveEvent.clientX - start.x;
      const dyPx = moveEvent.clientY - start.y;
      if(selected.type === 'original'){
        if(mode === 'move'){
          originalRecord.dx = clamp(Number(initial.dx || 0) + dxPx / slideRect.width * 100, -95, 95);
          originalRecord.dy = clamp(Number(initial.dy || 0) + dyPx / slideRect.height * 100, -95, 95);
        }else{
          const delta = Math.max(dxPx / Math.max(1,nodeRect.width), dyPx / Math.max(1,nodeRect.height));
          originalRecord.scale = clamp(Number(initial.scale || 1) + delta, .5, 2);
        }
        applyOriginal(node);
      }else if(overlayRecord){
        if(mode === 'move'){
          overlayRecord.x = clamp(Number(initial.x || 0) + dxPx / slideRect.width * 100, 0, 100 - Number(initial.w || 10));
          overlayRecord.y = clamp(Number(initial.y || 0) + dyPx / slideRect.height * 100, 0, 100 - Number(initial.h || 10));
        }else{
          overlayRecord.w = clamp(Number(initial.w || 20) + dxPx / slideRect.width * 100, 3, 100 - Number(initial.x || 0));
          overlayRecord.h = clamp(Number(initial.h || 10) + dyPx / slideRect.height * 100, 3, 100 - Number(initial.y || 0));
        }
        Object.assign(node.style, {left:`${overlayRecord.x}%`,top:`${overlayRecord.y}%`,width:`${overlayRecord.w}%`,height:`${overlayRecord.h}%`});
      }
      updateSelectionBox();
    };
    const onUp = ()=>{
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      scheduleDraft();
      updateSelectionBox();
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp, {once:true});
  }
  moveHandle.addEventListener('pointerdown', event=>beginHandleDrag(event, 'move'));
  resizeHandle.addEventListener('pointerdown', event=>beginHandleDrag(event, 'resize'));

  const lightbox = document.createElement('div');
  lightbox.className = 'cf-media-lightbox';
  lightbox.innerHTML = '<img alt="放大预览">';
  document.body.appendChild(lightbox);
  lightbox.addEventListener('click', ()=>lightbox.classList.remove('open'));

  const toolbar = document.createElement('div');
  toolbar.className = 'cf-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'HTMLPPT 编辑工具栏');
  toolbar.innerHTML = `
    <div class="cf-group"><button type="button" data-action="config">配置</button><button type="button" class="cf-edit-toggle" data-action="edit" aria-pressed="false">编辑</button></div>
    <div class="cf-group" data-edit-only><button type="button" data-action="add-text">添加文本</button><button type="button" data-action="add-image">添加图片</button><button type="button" data-action="replace-image">替换图片</button><button type="button" data-action="delete">删除选中</button></div>
    <div class="cf-group" data-edit-only><button type="button" data-action="font-down" aria-label="减小字号">字−</button><button type="button" data-action="font-up" aria-label="增大字号">字＋</button><button type="button" data-action="nowrap">一行</button></div>
    <div class="cf-colors" aria-label="字体颜色">
      <button type="button" class="cf-color" data-color="#090909" style="background:#090909" title="近黑" aria-label="字体颜色：近黑"></button>
      <button type="button" class="cf-color" data-color="#1677ff" style="background:#1677ff" title="船帆蓝" aria-label="字体颜色：船帆蓝"></button>
      <button type="button" class="cf-color" data-color="#ff7a00" style="background:#ff7a00" title="行动橙" aria-label="字体颜色：行动橙"></button>
      <button type="button" class="cf-color" data-color="#525252" style="background:#525252" title="中性灰" aria-label="字体颜色：中性灰"></button>
      <button type="button" class="cf-color" data-color="#ffffff" style="background:#ffffff" title="白色" aria-label="字体颜色：白色"></button>
    </div>
    <div class="cf-group"><button type="button" data-action="save">保存</button><button type="button" data-action="backup">备份整套</button><button type="button" data-action="history">历史</button><button type="button" data-action="persist">落盘最新版</button></div>
    <div class="cf-group" data-edit-only><button type="button" data-action="reset-page">重置当前页</button><button type="button" data-action="restore-original">恢复原稿</button></div>
    <div class="cf-group"><button type="button" data-action="fullscreen">全屏</button><span class="cf-editor-status">未选中对象</span></div>
    <input class="cf-image-input" type="file" accept="image/*" hidden>`;
  document.body.appendChild(toolbar);
  const statusText = toolbar.querySelector('.cf-editor-status');
  const imageInput = toolbar.querySelector('.cf-image-input');

  const configPanel = document.createElement('div');
  configPanel.className = 'cf-editor-panel cf-editor-config';
  configPanel.setAttribute('role', 'dialog');
  configPanel.setAttribute('aria-label', '本地编辑配置');
  configPanel.innerHTML = `
    <h3>本地编辑配置</h3>
    <p class="cf-service-status">尚未检测本地编辑服务。</p>
    <p>图片与最新编辑状态会写入当前 PPT 文件夹；图片保存到 <strong>images/user-edits/</strong>，状态保存为 <strong>htmlppt-user-state.json</strong>。</p>
    <code class="cf-command"></code>
    <div class="cf-row"><input class="cf-service-url" aria-label="本地编辑服务地址"><button type="button" data-panel-action="check">检测</button><button type="button" data-panel-action="close">关闭</button></div>`;
  document.body.appendChild(configPanel);
  const serviceStatus = configPanel.querySelector('.cf-service-status');
  const serviceInput = configPanel.querySelector('.cf-service-url');
  serviceInput.value = serviceUrl;
  const deckDir = location.protocol === 'file:' ? decodeURIComponent(location.pathname).replace(/\/[^/]*$/, '') : '.';
  configPanel.querySelector('.cf-command').textContent = `python3 "${SCRIPT_PATH}" --deck-dir "${deckDir}" --open`;

  const historyPanel = document.createElement('div');
  historyPanel.className = 'cf-editor-panel cf-editor-history';
  historyPanel.setAttribute('role', 'dialog');
  historyPanel.setAttribute('aria-label', '历史版本');
  historyPanel.innerHTML = `
    <h3>历史版本</h3><p>恢复前会自动保存当前状态，恢复操作本身可以撤销。</p>
    <div class="cf-history-tabs"><button type="button" data-tab="page" aria-selected="true">当前页历史</button><button type="button" data-tab="deck" aria-selected="false">整套 PPT 备份</button></div>
    <div class="cf-history-list"></div>
    <div class="cf-row"><button type="button" data-panel-action="close-history">关闭</button></div>`;
  document.body.appendChild(historyPanel);
  const historyList = historyPanel.querySelector('.cf-history-list');
  let historyTab = 'page';

  function updateToolState(){
    const kind = selectedKind();
    const textSelected = kind === 'text';
    const imageSelected = kind === 'image';
    toolbar.querySelector('[data-action="delete"]').disabled = !selected;
    toolbar.querySelector('[data-action="replace-image"]').disabled = !imageSelected;
    toolbar.querySelector('[data-action="font-down"]').disabled = !textSelected;
    toolbar.querySelector('[data-action="font-up"]').disabled = !textSelected;
    toolbar.querySelector('[data-action="nowrap"]').disabled = !textSelected;
    toolbar.querySelectorAll('[data-color]').forEach(button=>button.disabled = !textSelected);
    statusText.textContent = selected ? `${kind === 'image' ? '图片' : '文字'}：${selected.id}` : '未选中对象';
  }

  function setEditMode(enabled){
    editing = !!enabled;
    body.classList.toggle('cf-edit-mode', editing);
    const toggle = toolbar.querySelector('[data-action="edit"]');
    toggle.textContent = editing ? '完成' : '编辑';
    toggle.setAttribute('aria-pressed', String(editing));
    textNodes.forEach(node=>{
      const record = elementRecord(node.dataset.editId);
      if(record && !record.deleted) node.contentEditable = editing ? 'true' : 'false';
    });
    renderAllOverlays();
    if(!editing){
      clearSelection();
      toolbar.scrollLeft = 0;
      const focused = document.activeElement;
      if(focused instanceof HTMLElement && focused.closest('.cf-editor-toolbar')) focused.blur();
    }
    updateToolState();
  }

  function captureDom(){
    textNodes.forEach(node=>{
      const record = elementRecord(node.dataset.editId);
      if(record && !record.deleted) record.html = node.innerHTML;
    });
    imageNodes.forEach(node=>{
      const record = elementRecord(node.dataset.editId);
      if(record && !record.deleted) record.src = node.getAttribute('src') || record.src;
    });
    document.querySelectorAll('.cf-overlay-item').forEach(node=>{
      const item = overlayFor(node.dataset.pageId, node.dataset.overlayId);
      const text = node.querySelector('.cf-overlay-text');
      if(item && text) item.text = text.innerHTML;
    });
  }

  function pushPageHistory(pageId, title, pageData){
    history.page[pageId] ||= [];
    history.page[pageId].unshift({
      id:`page-${Date.now()}-${Math.random().toString(16).slice(2)}`, title,
      createdAt:nowIso(), scope:'page', pageId, pageTitle:pageTitle(pageId), data:clone(pageData)
    });
    history.page[pageId] = history.page[pageId].slice(0, MAX_PAGE_HISTORY);
    persistHistory();
  }
  function pushDeckHistory(title, deckData=state){
    history.deck.unshift({
      id:`deck-${Date.now()}-${Math.random().toString(16).slice(2)}`, title,
      createdAt:nowIso(), scope:'deck', data:clone(deckData)
    });
    history.deck = history.deck.slice(0, MAX_DECK_HISTORY);
    persistHistory();
  }

  async function commitSave(){
    captureDom();
    const pageId = currentPageId();
    const before = lastSaved.pages?.[pageId] || baseline.pages?.[pageId] || state.pages[pageId];
    pushPageHistory(pageId, `保存前版本 · ${nowLabel()}`, before);
    state.updatedAt = nowIso();
    state.savedAt = state.updatedAt;
    state.dirty = false;
    lastSaved = clone(state);
    writeJson(keys.current, state);
    writeJson(keys.saved, lastSaved);
    const diskSaved = await savePackageToServer(false);
    toast(diskSaved ? '已保存并落盘最新版。' : '已保存到浏览器；需要模型继续修改时请点击“落盘最新版”。');
    renderHistory();
  }

  function applyState(){
    applyAllOriginals();
    renderAllOverlays();
    setEditMode(editing);
    clearSelection();
    syncNaturalVideos();
  }

  function restorePage(snapshot){
    const pageId = snapshot.pageId;
    if(!state.pages[pageId]) return;
    pushPageHistory(pageId, `恢复版本前 · ${nowLabel()}`, state.pages[pageId]);
    state.pages[pageId] = clone(snapshot.data);
    persistDraft();
    applyState();
    toast('当前页版本已恢复。');
  }
  function restoreDeck(snapshot){
    pushDeckHistory(`恢复版本前 · ${nowLabel()}`, state);
    state = mergeCurrent(snapshot.data, sourceBaseline);
    persistDraft();
    applyState();
    toast('整套 PPT 版本已恢复。');
  }
  function resetCurrentPage(){
    const pageId = currentPageId();
    if(!baseline.pages[pageId]) return;
    if(!confirm('仅重置当前页到原稿？其他页面和历史版本不会改变。')) return;
    pushPageHistory(pageId, `重置当前页前 · ${nowLabel()}`, state.pages[pageId]);
    state.pages[pageId] = clone(baseline.pages[pageId]);
    persistDraft();
    applyState();
    toast('当前页已重置。');
  }
  function restoreOriginal(){
    if(!confirm('恢复整套原稿？当前状态会先自动备份，历史不会清空。')) return;
    pushDeckHistory(`恢复原稿前版本 · ${nowLabel()}`, state);
    state = mergeCurrent(baseline, sourceBaseline);
    state.updatedAt = nowIso();
    state.dirty = true;
    persistDraft();
    applyState();
    toast('已恢复原稿，可从整套 PPT 备份中撤销。');
  }
  function deleteSelected(){
    if(!selected) return;
    if(selected.type === 'original'){
      const record = elementRecord(selected.id);
      if(record) record.deleted = true;
      const node = nodeMap.get(selected.id);
      if(node) node.style.display = 'none';
    }else{
      const item = overlayFor(selected.pageId, selected.id);
      if(item) item.deleted = true;
      renderPageOverlays(selected.pageId);
    }
    clearSelection();
    scheduleDraft();
  }

  function selectedTextRecord(){
    if(selectedKind() !== 'text') return null;
    if(selected.type === 'original') return elementRecord(selected.id);
    return overlayFor(selected.pageId, selected.id);
  }
  function adjustFont(delta){
    const record = selectedTextRecord();
    const node = selectedNode();
    if(!record || !node) return;
    const current = Number(record.fontSize) || parseFloat(getComputedStyle(node).fontSize) || 28;
    const next = clamp(current + delta, 12, 160);
    if(selected.type === 'original') record.fontSize = `${next}px`;
    else record.fontSize = next;
    if(selected.type === 'original') applyOriginal(node); else node.querySelector('.cf-overlay-text').style.fontSize = `${next}px`;
    updateSelectionBox();
    scheduleDraft();
  }
  function setColor(color){
    const record = selectedTextRecord();
    const node = selectedNode();
    if(!record || !node) return;
    record.color = color;
    if(selected.type === 'original') applyOriginal(node); else node.querySelector('.cf-overlay-text').style.color = color;
    scheduleDraft();
  }
  function toggleNowrap(){
    const record = selectedTextRecord();
    const node = selectedNode();
    if(!record || !node) return;
    if(selected.type === 'original'){
      record.whiteSpace = record.whiteSpace === 'nowrap' ? '' : 'nowrap';
      applyOriginal(node);
    }else{
      record.nowrap = !record.nowrap;
      node.querySelector('.cf-overlay-text').style.whiteSpace = record.nowrap ? 'nowrap' : 'normal';
    }
    updateSelectionBox();
    scheduleDraft();
  }

  function addText(){
    if(!editing) setEditMode(true);
    const pageId = currentPageId();
    const item = {
      id:`overlay-text-${Date.now()}`, type:'text', text:'双击编辑文字',
      x:14, y:18, w:32, h:12, fontSize:28, color:'#090909', nowrap:false,
      z:Date.now(), deleted:false
    };
    state.pages[pageId].overlays.push(item);
    renderPageOverlays(pageId);
    const node = currentSlide().querySelector(`.cf-overlay-item[data-overlay-id="${CSS.escape(item.id)}"]`);
    if(node) selectOverlay(node);
    scheduleDraft();
  }

  async function checkService(){
    serviceUrl = serviceInput.value.trim() || DEFAULT_SERVICE;
    localStorage.setItem(keys.service, serviceUrl);
    try{
      const response = await fetch(serviceUrl + '/__chuanfan_htmlppt_editor__/config', {cache:'no-store'});
      const data = await response.json();
      if(data.ok){
        serviceStatus.innerHTML = `<span class="ok">已连接</span> · 图片目录 ${data.saveDir} · 状态文件 ${data.stateFile || 'htmlppt-user-state.json'}`;
        return true;
      }
    }catch{}
    serviceStatus.innerHTML = '<span class="bad">未连接</span> · 先运行上面的命令，再点击“检测”。';
    return false;
  }
  async function uploadImage(file){
    if(!await checkService()) throw new Error('local editor service is not running');
    const form = new FormData();
    form.append('file', file, file.name || 'image.png');
    const response = await fetch(serviceUrl + '/__chuanfan_htmlppt_editor__/upload-image', {method:'POST',body:form});
    const data = await response.json();
    if(!data.ok) throw new Error(data.error || 'upload failed');
    return data.path;
  }
  const imageSize = src => new Promise(resolve=>{
    const image = new Image();
    image.onload = ()=>resolve({width:image.naturalWidth || 1,height:image.naturalHeight || 1});
    image.onerror = ()=>resolve({width:16,height:9});
    image.src = src;
  });
  async function addUploadedImage(path){
    const pageId = currentPageId();
    const size = await imageSize(path);
    const slide = currentSlide();
    const slideRatio = (slide.clientWidth || innerWidth) / (slide.clientHeight || innerHeight);
    const width = 32;
    const height = clamp(width * slideRatio / (size.width / size.height), 8, 64);
    const item = {id:`overlay-image-${Date.now()}`,type:'image',src:path,alt:'新增图片',x:14,y:18,w:width,h:height,z:Date.now(),deleted:false};
    state.pages[pageId].overlays.push(item);
    renderPageOverlays(pageId);
    const node = slide.querySelector(`.cf-overlay-item[data-overlay-id="${CSS.escape(item.id)}"]`);
    if(node) selectOverlay(node);
    scheduleDraft();
  }
  async function replaceSelectedImage(path){
    if(selectedKind() !== 'image') return;
    if(selected.type === 'original'){
      const record = elementRecord(selected.id);
      const node = selectedNode();
      record.src = path;
      record.deleted = false;
      if(node){
        node.src = path;
        node.style.objectFit = 'contain';
        node.style.height = 'auto';
      }
    }else{
      const item = overlayFor(selected.pageId, selected.id);
      const size = await imageSize(path);
      const slide = slides.find(value=>value.dataset.slideId === selected.pageId);
      const ratio = (slide.clientWidth || innerWidth) / (slide.clientHeight || innerHeight);
      item.src = path;
      item.h = clamp(item.w * ratio / (size.width / size.height), 4, 100 - item.y);
      renderPageOverlays(selected.pageId);
    }
    scheduleDraft();
    updateSelectionBox();
  }

  function packageData(){
    captureDom();
    return {
      format:'chuanfan-htmlppt-state', version:VERSION, schema:SCHEMA,
      deckScope:scope, sourceRevision, exportedAt:nowIso(),
      baseline:clone(baseline), current:clone(state), lastSaved:clone(lastSaved), history:clone(history)
    };
  }
  function downloadPackage(filename='htmlppt-user-state.json'){
    const blob = new Blob([JSON.stringify(packageData(), null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
  async function savePackageToServer(downloadOnFailure=true){
    if(!await checkService()){
      if(downloadOnFailure) downloadPackage();
      return false;
    }
    try{
      const response = await fetch(serviceUrl + '/__chuanfan_htmlppt_editor__/save-state', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(packageData())
      });
      const data = await response.json();
      if(!data.ok) throw new Error(data.error || 'save state failed');
      return true;
    }catch(error){
      if(downloadOnFailure) downloadPackage();
      return false;
    }
  }

  function renderHistory(){
    if(!historyPanel.classList.contains('open')) return;
    historyPanel.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected', String(button.dataset.tab === historyTab)));
    const items = historyTab === 'page' ? (history.page[currentPageId()] || []) : history.deck;
    historyList.innerHTML = '';
    if(!items.length){
      historyList.innerHTML = `<div class="cf-history-empty">${historyTab === 'page' ? '当前页还没有历史版本。点击“保存”后会自动生成保存前版本。' : '还没有整套 PPT 备份。点击“备份整套”创建。'}</div>`;
      return;
    }
    items.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'cf-history-item';
      row.innerHTML = '<div class="cf-history-title"></div><div class="cf-history-meta"></div><div class="cf-row"><button type="button" data-history-action="restore">恢复此版本</button><button type="button" data-history-action="delete">删除版本</button></div>';
      row.querySelector('.cf-history-title').textContent = item.title || '未命名版本';
      row.querySelector('.cf-history-meta').textContent = `${new Date(item.createdAt).toLocaleString('zh-CN',{hour12:false})} · ${item.scope === 'page' ? `${item.pageTitle || item.pageId}` : '整套 PPT'}`;
      row.querySelector('[data-history-action="restore"]').addEventListener('click', ()=>{
        if(!confirm('恢复此版本？当前状态会先自动备份。')) return;
        if(item.scope === 'page') restorePage(item); else restoreDeck(item);
        renderHistory();
      });
      row.querySelector('[data-history-action="delete"]').addEventListener('click', ()=>{
        if(!confirm('只删除这一条历史版本？当前工作内容不会改变。')) return;
        if(item.scope === 'page') history.page[item.pageId] = (history.page[item.pageId] || []).filter(value=>value.id !== item.id);
        else history.deck = history.deck.filter(value=>value.id !== item.id);
        persistHistory();
        renderHistory();
      });
      historyList.appendChild(row);
    });
  }

  function syncNaturalVideo(video){
    const apply = ()=>{
      const width = video.videoWidth;
      const height = video.videoHeight;
      if(!width || !height) return;
      const frame = video.closest('.video-natural') || video.parentElement;
      if(!frame) return;
      frame.classList.add('video-natural');
      const host = frame.parentElement || frame;
      const maxWidth = host.clientWidth || innerWidth * .7;
      const maxHeight = host.clientHeight || innerHeight * .68;
      const scale = Math.min(maxWidth / width, maxHeight / height);
      frame.style.width = `${Math.max(1, width * scale)}px`;
      frame.style.height = `${Math.max(1, height * scale)}px`;
      frame.style.aspectRatio = `${width} / ${height}`;
      frame.style.margin = '0';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
    };
    if(video.readyState >= 1) apply(); else video.addEventListener('loadedmetadata', apply, {once:true});
  }
  function syncNaturalVideos(){
    document.querySelectorAll('video').forEach(syncNaturalVideo);
  }

  toolbar.addEventListener('click', async event=>{
    const button = event.target.closest('button');
    if(!button) return;
    event.stopPropagation();
    const action = button.dataset.action;
    if(action === 'config'){configPanel.classList.add('open'); await checkService();}
    if(action === 'edit') setEditMode(!editing);
    if(action === 'add-text') addText();
    if(action === 'add-image'){if(!editing) setEditMode(true); imageAction='add'; imageInput.click();}
    if(action === 'replace-image'){imageAction='replace'; imageInput.click();}
    if(action === 'delete') deleteSelected();
    if(action === 'font-down') adjustFont(-2);
    if(action === 'font-up') adjustFont(2);
    if(action === 'nowrap') toggleNowrap();
    if(action === 'save') await commitSave();
    if(action === 'backup'){captureDom();pushDeckHistory(`手动整套备份 · ${nowLabel()}`);toast('整套 PPT 已备份。');renderHistory();}
    if(action === 'history'){historyPanel.classList.add('open');renderHistory();}
    if(action === 'persist'){const ok=await savePackageToServer(true);toast(ok?'最新版已落盘。':'服务未连接，已下载状态文件。');}
    if(action === 'reset-page') resetCurrentPage();
    if(action === 'restore-original') restoreOriginal();
    if(action === 'fullscreen'){
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    }
  });
  toolbar.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click', event=>{
    event.stopPropagation();
    setColor(button.dataset.color);
  }));
  imageInput.addEventListener('change', async ()=>{
    const file = imageInput.files?.[0];
    if(!file) return;
    try{
      const path = await uploadImage(file);
      if(imageAction === 'replace') await replaceSelectedImage(path); else await addUploadedImage(path);
      toast('图片已保存到 PPT 文件夹。');
    }catch(error){
      console.error('[Chuanfan HTMLPPT] image operation failed', error);
      configPanel.classList.add('open');
      toast(`图片未保存：${error?.message || '未知错误'}`);
    }finally{
      imageInput.value = '';
      imageAction = 'add';
    }
  });

  configPanel.addEventListener('click', async event=>{
    const action = event.target.closest('button')?.dataset.panelAction;
    if(action === 'check') await checkService();
    if(action === 'close') configPanel.classList.remove('open');
  });
  historyPanel.addEventListener('click', event=>{
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if(tab){historyTab=tab;renderHistory();}
    if(event.target.closest('[data-panel-action="close-history"]')) historyPanel.classList.remove('open');
  });

  document.addEventListener('click', event=>{
    if(event.target.closest('.cf-editor-toolbar,.cf-editor-panel,.cf-selection-box')) return;
    const overlay = event.target.closest('.cf-overlay-item');
    const original = event.target.closest('[data-edit-id]');
    if(editing){
      if(event.target.closest('a[href]')) event.preventDefault();
      if(overlay) selectOverlay(overlay);
      else if(original) selectOriginal(original);
      else clearSelection();
      return;
    }
    const image = event.target.closest('img[src]');
    if(image){
      event.preventDefault();
      lightbox.querySelector('img').src = image.currentSrc || image.src;
      lightbox.classList.add('open');
    }
  }, true);

  textNodes.forEach(node=>node.addEventListener('input', ()=>{
    if(!editing) return;
    const record = elementRecord(node.dataset.editId);
    if(record) record.html = node.innerHTML;
    scheduleDraft();
  }));

  document.addEventListener('keydown', event=>{
    const target = event.target instanceof Element ? event.target : null;
    if(event.key === 'Escape'){
      if(historyPanel.classList.contains('open')){event.preventDefault();event.stopPropagation();historyPanel.classList.remove('open');return;}
      if(configPanel.classList.contains('open')){event.preventDefault();event.stopPropagation();configPanel.classList.remove('open');return;}
      if(lightbox.classList.contains('open')){event.preventDefault();event.stopPropagation();lightbox.classList.remove('open');return;}
      if(editing){event.stopPropagation();return;}
    }
    if(!editing) return;
    const isTyping = !!target?.closest('input,textarea,select,[contenteditable="true"]');
    if((event.key === 'Delete' || event.key === 'Backspace') && selected && !isTyping){
      event.preventDefault();event.stopPropagation();deleteSelected();return;
    }
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown',' ','Home','End'].includes(event.key)){
      event.stopPropagation();
    }
  });
  document.addEventListener('wheel', event=>{if(editing) event.stopPropagation();}, {passive:false});
  document.addEventListener('touchend', event=>{if(editing) event.stopPropagation();});

  document.querySelectorAll('a[href^="http://"],a[href^="https://"]').forEach(link=>{
    link.target = '_blank';
    const rel = new Set((link.rel || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');rel.add('noreferrer');
    link.rel = [...rel].join(' ');
  });

  addEventListener('resize', ()=>{
    applyAllOriginals();
    updateSelectionBox();
    syncNaturalVideos();
  });
  const deck = document.querySelector('#deck');
  if(deck){
    deck.addEventListener('transitionend', ()=>{updateSelectionBox();renderHistory();});
  }

  applyAllOriginals();
  renderAllOverlays();
  syncNaturalVideos();
  updateToolState();
  persistHistory();
  writeJson(keys.current, state);
  writeJson(keys.saved, lastSaved);

  window.__CHUANFAN_HTMLPPT_EDITOR__ = {
    version:VERSION, schema:SCHEMA, ready:true,
    isEditing:()=>editing,
    getState:()=>clone(state),
    getBaseline:()=>clone(baseline),
    getHistory:()=>clone(history),
    save:commitSave,
    backup:()=>pushDeckHistory(`API 整套备份 · ${nowLabel()}`),
    export:downloadPackage,
    resetCurrentPage,
    restoreOriginal
  };
})();
