/* RepoDoc kanban board webview — plain browser ES2020, no build step. */
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();

  /* ---- Local UI state (survives data re-renders) ---- */
  var state = {
    data: null, // { boardId, board, config, boardPath }
    query: '',
    filterAgent: null,
    addingCol: null, // column id currently showing the composer
    openCardId: null,
    blocked: null, // {cardId, toColumn, results:[{id,label,satisfied,reason}]} for the blocked-move dialog
    lastMove: null, // {cardId, toColumn, index} of the most recent move attempt (for override retry)
  };

  var addText = ''; // uncontrolled composer text; never triggers a render

  /* ---- Drag state ---- */
  var drag = {
    active: false,
    cardId: null,
    el: null, // the dragged card DOM node
    placeholder: null,
    pendingData: null, // data received mid-drag, applied on dragend
  };

  /* ---- Inline SVG icons (from the design mock) ---- */
  var ICON = {
    search:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>',
    checklist:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
    comment:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    check:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>',
    shield:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
  };

  /* ---- Priority mappings (single source of truth) ---- */
  // Priority accents are UI chrome, so they follow the theme's chart colours
  // (red/amber for high/med, muted foreground for low). Each entry pairs the
  // `--vscode-*` token.
  var PRIORITY_VARS = {
    high: { token: '--vscode-charts-red' },
    med: { token: '--vscode-charts-yellow' },
    low: { token: '--vscode-descriptionForeground' },
  };
  var PRIORITY_LABELS = { high: 'High', med: 'Medium', low: 'Low' };

  /* ---- Helpers ---- */
  // Intentionally mirrors the host-side escapeHtml: the webview is deliberately
  // build-step-free, so no shared module can be imported here.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var EVT = {
    onClick: 'click',
    onInput: 'input',
    onChange: 'change',
    onKeyDown: 'keydown',
    onDragStart: 'dragstart',
    onDragEnd: 'dragend',
    onDragOver: 'dragover',
    onDrop: 'drop',
    onMouseDown: 'mousedown',
  };

  /**
   * Tiny DOM builder. props: {class, style, title, draggable, html, dataset, on*}.
   * Children are appended as text nodes (safe) or existing nodes.
   */
  function h(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) {
          continue;
        }
        var val = props[key];
        if (val == null) {
          continue;
        }
        if (key === 'class') {
          node.className = val;
        } else if (key === 'style') {
          node.setAttribute('style', val);
        } else if (key === 'html') {
          node.innerHTML = val; // trusted static SVG strings only
        } else if (key === 'dataset') {
          for (var dk in val) {
            if (Object.prototype.hasOwnProperty.call(val, dk)) {
              node.dataset[dk] = val[dk];
            }
          }
        } else if (key === 'draggable') {
          node.draggable = !!val;
        } else if (EVT[key]) {
          node.addEventListener(EVT[key], val);
        } else {
          node.setAttribute(key, val);
        }
      }
    }
    if (children != null) {
      appendChildren(node, children);
    }
    return node;
  }

  function appendChildren(node, children) {
    if (Array.isArray(children)) {
      for (var i = 0; i < children.length; i++) {
        appendChildren(node, children[i]);
      }
    } else if (children instanceof Node) {
      node.appendChild(children);
    } else if (children != null && children !== false) {
      node.appendChild(document.createTextNode(String(children)));
    }
  }

  function icon(markup, className) {
    return h('span', { class: className || 'icon', html: markup });
  }

  function humanizeTime(iso) {
    if (!iso) {
      return '';
    }
    var then = Date.parse(iso);
    if (isNaN(then)) {
      return String(iso);
    }
    var secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) {
      return 'just now';
    }
    var mins = Math.floor(secs / 60);
    if (mins < 60) {
      return mins + 'm';
    }
    var hours = Math.floor(mins / 60);
    if (hours < 24) {
      return hours + 'h';
    }
    var days = Math.floor(hours / 24);
    if (days < 7) {
      return days + 'd';
    }
    return Math.floor(days / 7) + 'w';
  }


  // Tinted chip/pill style: solid text, translucent fill + border in the same hue.
  // Used for DATA colours (labels) supplied verbatim from the board .config.json,
  // so the 22/44 hex-alpha suffixes are applied to the literal colour.
  function tintStyle(color) {
    return 'color:' + color + ';background:' + color + '22;border:1px solid ' + color + '44;';
  }

  // Theme-aware equivalent of tintStyle for CHROME accents that resolve from a
  // `--vscode-*` token. color-mix reproduces the 0x22 (~13%) fill and 0x44
  // (~27%) border alphas against the resolved variable.
  function tintVar(token) {
    var c = 'var(' + token + ')';
    return (
      'color:' +
      c +
      ';background:color-mix(in srgb, ' +
      c +
      ' 13%, transparent);border:1px solid color-mix(in srgb, ' +
      c +
      ' 27%, transparent);'
    );
  }

  function matches(card) {
    var q = state.query.trim().toLowerCase();
    if (q && card.title.toLowerCase().indexOf(q) === -1) {
      return false;
    }
    if (state.filterAgent && card.agent !== state.filterAgent) {
      return false;
    }
    return true;
  }

  function board() {
    return state.data ? state.data.board : null;
  }
  function config() {
    return state.data ? state.data.config : { labels: {}, agents: {}, fields: [] };
  }
  function fieldDefs() {
    var f = config().fields;
    return Array.isArray(f) ? f : [];
  }
  function titleCase(id) {
    return String(id == null ? '' : id)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }
  function fieldLabel(def) {
    return def.label || titleCase(def.id);
  }
  function gateLabel(def) {
    return def.label || def.id;
  }

  // First done `## Gates` evidence line for a gate id (null when absent).
  function gateEvidence(card, gateId) {
    var gates = card.gates || [];
    for (var i = 0; i < gates.length; i++) {
      if (gates[i].gateId === gateId && gates[i].done) {
        return gates[i];
      }
    }
    return null;
  }

  // Pure client-side mirror of the core gate semantics: does this card satisfy
  // the given gate right now? (Used for the card-face n/m chip and modal icons;
  // the host re-evaluates authoritatively on move.)
  function gateSatisfied(card, def) {
    switch (def.kind) {
      case 'checklist':
        return (card.checklist || []).every(function (x) {
          return x.done;
        });
      case 'field': {
        var val = (card.custom || {})[def.field];
        if (def.equals != null) {
          return String(val) === String(def.equals);
        }
        return (
          val != null && val !== '' && !(Array.isArray(val) && val.length === 0)
        );
      }
      case 'command':
        return !!gateEvidence(card, def.id);
      case 'approval': {
        var by = def.by || [];
        var gates = card.gates || [];
        for (var i = 0; i < gates.length; i++) {
          var g = gates[i];
          if (g.gateId !== def.id || !g.done) {
            continue;
          }
          if (!by.length) {
            return true;
          }
          var note = String(g.note || '').toLowerCase();
          for (var j = 0; j < by.length; j++) {
            if (note.indexOf(String(by[j]).toLowerCase()) !== -1) {
              return true;
            }
          }
        }
        return false;
      }
      default:
        return false;
    }
  }
  function agentDef(key) {
    var agents = config().agents || {};
    return key && agents[key] ? agents[key] : null;
  }
  function labelDef(key) {
    var labels = config().labels || {};
    return key && labels[key] ? labels[key] : null;
  }

  function subtaskProgress(card) {
    if (!card.checklist || !card.checklist.length) {
      return null;
    }
    var done = 0;
    for (var i = 0; i < card.checklist.length; i++) {
      if (card.checklist[i].done) {
        done++;
      }
    }
    return { done: done, total: card.checklist.length };
  }

  /* ---- Top bar ---- */
  function buildTopBar() {
    var b = board();
    var cfg = config();

    var crumb = h('div', { class: 'crumb' }, [
      h('span', { class: 'crumb-section' }, 'Boards'),
      h('span', { class: 'crumb-sep' }, '/'),
      h('span', { class: 'crumb-leaf' }, b ? b.name : ''),
    ]);

    var searchInput = h('input', {
      id: 'search-input',
      placeholder: 'Search cards',
      value: state.query,
      onInput: function (e) {
        state.query = e.target.value;
        render();
      },
    });
    var search = h('div', { class: 'search' }, [icon(ICON.search), searchInput]);

    var chips = [];
    var agents = cfg.agents || {};
    Object.keys(agents).forEach(function (key) {
      var a = agents[key];
      // Repo .config.json is untrusted (hand-editable); skip malformed entries.
      if (!a || typeof a.color !== 'string' || typeof a.initials !== 'string') {
        return;
      }
      var on = state.filterAgent === key;
      var style =
        'background:' +
        a.color +
        ';opacity:' +
        (state.filterAgent && !on ? '0.35' : '1') +
        ';box-shadow:' +
        (on
          ? '0 0 0 2px var(--vscode-editor-background), 0 0 0 4px ' + a.color
          : 'none') +
        ';';
      chips.push(
        h(
          'div',
          {
            class: 'chip',
            style: style,
            title: a.name,
            onClick: function () {
              state.filterAgent = on ? null : key;
              render();
            },
          },
          a.initials,
        ),
      );
    });

    var right = h('div', { class: 'topbar-right' }, [
      search,
      h('div', { class: 'chips' }, chips),
    ]);

    return h('div', { class: 'topbar' }, [crumb, h('div', { class: 'topbar-spacer' }), right]);
  }

  /* ---- Label chip ---- */
  function labelChip(key) {
    var l = labelDef(key);
    if (!l) {
      return null;
    }
    return h('span', { class: 'label-chip', style: tintStyle(l.color) }, l.name);
  }

  // Small muted chip for a showOnCard field value (null when nothing to show).
  function showOnCardChip(def, card) {
    var val = (card.custom || {})[def.id];
    if (val == null || val === '' || (Array.isArray(val) && !val.length)) {
      return null;
    }
    if (def.type === 'boolean') {
      // Boolean renders just the label when true; nothing when false.
      return val ? h('span', { class: 'field-chip' }, fieldLabel(def)) : null;
    }
    var shown = Array.isArray(val) ? val.join(', ') : String(val);
    return h('span', { class: 'field-chip' }, fieldLabel(def) + ': ' + shown);
  }

  // Shield chip counting satisfied/total exit gates for the card's column.
  function exitGateChip(card, col) {
    if (!col || !col.exit || !col.exit.length) {
      return null;
    }
    var total = col.exit.length;
    var sat = 0;
    var labels = [];
    col.exit.forEach(function (def) {
      var ok = gateSatisfied(card, def);
      if (ok) {
        sat++;
      }
      labels.push((ok ? '✓ ' : '○ ') + gateLabel(def));
    });
    return h(
      'span',
      {
        class: 'gate-chip' + (sat >= total ? ' ok' : ''),
        title: 'Exit gates\n' + labels.join('\n'),
      },
      [icon(ICON.shield, 'icon'), sat + '/' + total],
    );
  }

  /* ---- Card ---- */
  function buildCard(cardId, card, col) {
    var children = [];

    if (card.labels && card.labels.length) {
      var chips = card.labels.map(labelChip).filter(Boolean);
      if (chips.length) {
        children.push(h('div', { class: 'card-labels' }, chips));
      }
    }

    var titleRow = [];
    if (card.priority === 'high' || card.priority === 'med') {
      var pv = PRIORITY_VARS[card.priority];
      var pColor = 'var(' + pv.token + ')';
      var pGlowAlpha = card.priority === 'high' ? '18%' : '16%';
      var pGlow = 'color-mix(in srgb, ' + pColor + ' ' + pGlowAlpha + ', transparent)';
      titleRow.push(
        h('span', {
          class: 'priority-dot',
          title: 'Priority',
          style: 'background:' + pColor + ';box-shadow:0 0 0 3px ' + pGlow + ';',
        }),
      );
    }
    titleRow.push(h('div', { class: 'card-title' }, card.title));
    children.push(h('div', { class: 'card-titlerow' }, titleRow));

    if (card.live) {
      var pct = (card.progress || 0) + '%';
      children.push(
        h('div', { class: 'live-block' }, [
          h('div', { class: 'live-row' }, [
            h('span', { class: 'live-dot' }),
            h('span', { class: 'live-status' }, card.status || ''),
            h('span', { class: 'live-pct' }, pct),
          ]),
          h('div', { class: 'progress-track' }, [
            h('div', { class: 'progress-fill', style: 'width:' + pct + ';' }),
          ]),
        ]),
      );
    }

    var meta = [];
    var sub = subtaskProgress(card);
    if (sub) {
      meta.push(
        h('span', { class: 'meta-item' }, [
          icon(ICON.checklist, 'icon'),
          sub.done + '/' + sub.total,
        ]),
      );
    }
    if (card.comments) {
      meta.push(
        h('span', { class: 'meta-item' }, [icon(ICON.comment, 'icon'), String(card.comments)]),
      );
    }
    var gateChip = exitGateChip(card, col);
    if (gateChip) {
      meta.push(gateChip);
    }
    fieldDefs().forEach(function (def) {
      if (!def.showOnCard) {
        return;
      }
      var chip = showOnCardChip(def, card);
      if (chip) {
        meta.push(chip);
      }
    });
    meta.push(h('div', { class: 'meta-spacer' }));
    meta.push(h('span', { class: 'meta-updated' }, humanizeTime(card.updatedAt)));
    var ag = agentDef(card.agent);
    if (ag) {
      meta.push(
        h(
          'span',
          { class: 'meta-avatar', style: 'background:' + ag.color + ';', title: ag.name },
          ag.initials,
        ),
      );
    }
    children.push(h('div', { class: 'card-meta' }, meta));

    var cardEl = h(
      'div',
      {
        class: 'card',
        draggable: true,
        dataset: { cardId: cardId },
        onClick: function () {
          state.openCardId = cardId;
          render();
        },
        onDragStart: function (e) {
          onCardDragStart(e, cardId, cardEl);
        },
        onDragEnd: onDragEnd,
        onDragOver: function (e) {
          onCardDragOver(e, cardEl);
        },
      },
      children,
    );
    return cardEl;
  }

  /* ---- Column ---- */
  function buildColumn(col) {
    var b = board();
    var visible = [];
    for (var i = 0; i < col.cardIds.length; i++) {
      var c = b.cards[col.cardIds[i]];
      if (c && matches(c)) {
        visible.push({ id: col.cardIds[i], card: c });
      }
    }

    var head = [
      h('span', { class: 'col-dot', style: 'background:' + col.color + ';' }),
      h('span', { class: 'col-name' }, col.name),
    ];
    var hasEnter = col.enter && col.enter.length;
    var hasExit = col.exit && col.exit.length;
    if (hasEnter || hasExit) {
      var tip = [];
      if (hasEnter) {
        tip.push('enter: ' + col.enter.map(gateLabel).join(', '));
      }
      if (hasExit) {
        tip.push('exit: ' + col.exit.map(gateLabel).join(', '));
      }
      head.push(
        h('span', { class: 'col-gate-glyph', title: tip.join(' / '), html: ICON.shield }),
      );
    }
    head.push(h('span', { class: 'col-count' }, String(visible.length)));
    head.push(h('div', { class: 'col-head-spacer' }));
    if (col.wip) {
      var over = visible.length > col.wip;
      head.push(
        h('span', { class: 'wip' + (over ? ' over' : '') }, visible.length + '/' + col.wip),
      );
    }

    var listChildren = visible.map(function (x) {
      return buildCard(x.id, x.card, col);
    });
    var list = h('div', { class: 'card-list', dataset: { colId: col.id } }, listChildren);

    var composer = buildComposer(col);

    var colEl = h(
      'div',
      {
        class: 'column',
        dataset: { colId: col.id },
        onDragOver: function (e) {
          onColumnDragOver(e, colEl, list);
        },
        onDrop: function (e) {
          onColumnDrop(e);
        },
      },
      [h('div', { class: 'col-head' }, head), list, composer],
    );
    return colEl;
  }

  function buildComposer(col) {
    if (state.addingCol === col.id) {
      var textarea = h('textarea', {
        id: 'composer-' + col.id,
        placeholder: 'Enter a title for this card...',
        onInput: function (e) {
          addText = e.target.value; // no render
        },
        onKeyDown: function (e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveCard(col.id);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelComposer();
          }
        },
      });
      textarea.value = addText;
      var actions = h('div', { class: 'composer-actions' }, [
        h(
          'button',
          {
            class: 'btn-primary',
            onClick: function () {
              saveCard(col.id);
            },
          },
          'Add card',
        ),
        h('button', { class: 'btn-cancel', onClick: cancelComposer }, '✕'),
      ]);
      return h('div', { class: 'composer' }, [textarea, actions]);
    }
    return h('div', { class: 'composer' }, [
      h(
        'button',
        {
          class: 'add-card-btn',
          onClick: function () {
            state.addingCol = col.id;
            addText = '';
            render();
          },
        },
        [h('span', { class: 'plus' }, '+'), ' Add a card'],
      ),
    ]);
  }

  function saveCard(colId) {
    var value = addText.trim();
    if (value) {
      vscode.postMessage({ type: 'addCard', column: colId, title: value });
    }
    state.addingCol = null;
    addText = '';
    render();
  }

  function cancelComposer() {
    state.addingCol = null;
    addText = '';
    render();
  }

  /* ---- Canvas ---- */
  function buildCanvas() {
    var b = board();
    var cols = (b.columns || []).map(buildColumn);
    var addList = h('div', { class: 'add-list-wrap' }, [
      h(
        'button',
        {
          class: 'add-list-btn',
          onClick: function () {
            vscode.postMessage({ type: 'addColumn' });
          },
        },
        [h('span', { class: 'plus' }, '+'), ' Add another list'],
      ),
    ]);
    var inner = h('div', { class: 'canvas-inner' }, cols.concat([addList]));
    return h('div', { class: 'canvas' }, [inner]);
  }

  /* ---- Status bar ---- */
  function buildStatusBar() {
    var b = board();
    var live = 0;
    var total = 0;
    (b.columns || []).forEach(function (col) {
      col.cardIds.forEach(function (id) {
        var c = b.cards[id];
        if (c) {
          total++;
          if (c.live) {
            live++;
          }
        }
      });
    });
    var boardPath = (state.data && state.data.boardPath) || '';
    return h('div', { class: 'statusbar' }, [
      h('span', { class: 'status-live' }, [
        h('span', { class: 'status-live-dot' }),
        live + ' agents active',
      ]),
      h('span', {}, total + ' cards'),
      h('div', { class: 'status-spacer' }),
      h('span', { class: 'status-datadir' }, boardPath),
    ]);
  }

  /* ---- Card detail modal ---- */
  function columnOfCard(cardId) {
    var b = board();
    for (var i = 0; i < b.columns.length; i++) {
      if (b.columns[i].cardIds.indexOf(cardId) !== -1) {
        return b.columns[i];
      }
    }
    return null;
  }

  function modalHead(card, col) {
    var badges = (card.labels || []).map(labelChip).filter(Boolean);
    badges.push(h('span', { class: 'col-badge' }, col ? col.name : ''));
    return h('div', { class: 'modal-head' }, [
      h('div', { class: 'modal-head-row' }, [
        h('div', { class: 'modal-head-main' }, [
          h('div', { class: 'modal-badges' }, badges),
          h('div', { class: 'modal-title' }, card.title),
        ]),
        h('button', { class: 'modal-close', onClick: closeModal }, '✕'),
      ]),
    ]);
  }

  function modalLiveBanner(card) {
    if (!card.live) {
      return null;
    }
    var ag = agentDef(card.agent);
    return h('div', { class: 'modal-live' }, [
      h('span', { class: 'modal-live-dot' }),
      h('div', { class: 'modal-live-main' }, [
        h('div', { class: 'modal-live-status' }, card.status || ''),
        h(
          'div',
          { class: 'modal-live-sub' },
          (ag ? ag.name : 'Agent') + ' · ' + (card.progress || 0) + '% complete',
        ),
      ]),
    ]);
  }

  function modalMeta(card) {
    var prV = PRIORITY_VARS[card.priority] || PRIORITY_VARS.low;
    var prL = PRIORITY_LABELS[card.priority] || PRIORITY_LABELS.med;
    var priorityPill = h('span', { class: 'priority-pill', style: tintVar(prV.token) }, prL);
    return h('div', { class: 'modal-cols' }, [
      h('div', {}, [h('div', { class: 'field-label' }, 'Priority'), priorityPill]),
    ]);
  }

  function modalDescription(card) {
    if (!card.desc) {
      return null;
    }
    return h('div', { class: 'section' }, [
      h('div', { class: 'field-label' }, 'Description'),
      h('div', { class: 'section-desc' }, card.desc),
    ]);
  }

  function modalChecklist(card) {
    if (!card.checklist || !card.checklist.length) {
      return null;
    }
    var done = 0;
    card.checklist.forEach(function (x) {
      if (x.done) {
        done++;
      }
    });
    var items = card.checklist.map(function (item, index) {
      var boxChildren = item.done ? [icon(ICON.check, 'icon')] : [];
      return h(
        'div',
        {
          class: 'check-item',
          onClick: function () {
            vscode.postMessage({
              type: 'toggleCheck',
              cardId: state.openCardId,
              index: index,
            });
          },
        },
        [
          h('span', { class: 'check-box' + (item.done ? ' done' : '') }, boxChildren),
          h('span', { class: 'check-text' + (item.done ? ' done' : '') }, item.text),
        ],
      );
    });
    return h('div', { class: 'section' }, [
      h('div', { class: 'checklist-head' }, [
        h('div', { class: 'field-label', style: 'margin-bottom:0;' }, 'Checklist'),
        h('span', { class: 'checklist-count' }, done + '/' + card.checklist.length),
      ]),
      h('div', { class: 'checklist' }, items),
    ]);
  }


  function postField(cardId, fieldId, value) {
    vscode.postMessage({ type: 'setField', cardId: cardId, fieldId: fieldId, value: value });
  }

  // Editor node for one custom field. Text/number/date post on 'change' (blur or
  // Enter) so typing never re-renders and the input keeps focus; toggles/selects
  // post immediately (the host echo re-render is harmless for those).
  function fieldEditor(def, card) {
    var cardId = state.openCardId;
    var val = (card.custom || {})[def.id];

    if (def.type === 'boolean') {
      var on = val === true;
      return h(
        'div',
        {
          class: 'field-bool',
          onClick: function () {
            postField(cardId, def.id, !on);
          },
        },
        [
          h(
            'span',
            { class: 'check-box' + (on ? ' done' : '') },
            on ? [icon(ICON.check, 'icon')] : [],
          ),
          h('span', { class: 'field-bool-label' }, on ? 'Yes' : 'No'),
        ],
      );
    }

    if (def.type === 'select') {
      var options = def.options || [];
      var known = val != null && val !== '' && options.indexOf(String(val)) !== -1;
      var unknown = val != null && val !== '' && !known;
      var optionNodes = [h('option', { value: '' }, '')];
      options.forEach(function (opt) {
        optionNodes.push(h('option', { value: opt }, opt));
      });
      if (unknown) {
        optionNodes.push(h('option', { value: String(val) }, String(val) + ' (unknown)'));
      }
      var select = h(
        'select',
        {
          class: 'field-select' + (unknown ? ' unknown' : ''),
          onChange: function (e) {
            var v = e.target.value;
            postField(cardId, def.id, v === '' ? null : v);
          },
        },
        optionNodes,
      );
      select.value = val != null ? String(val) : '';
      return select;
    }

    if (def.type === 'multiselect') {
      var current = Array.isArray(val) ? val.slice() : [];
      var chips = (def.options || []).map(function (opt) {
        var selected = current.indexOf(opt) !== -1;
        return h(
          'span',
          {
            class: 'ms-chip' + (selected ? ' on' : ''),
            style: selected ? tintVar('--vscode-focusBorder') : null,
            onClick: function () {
              var next = current.slice();
              var idx = next.indexOf(opt);
              if (idx === -1) {
                next.push(opt);
              } else {
                next.splice(idx, 1);
              }
              postField(cardId, def.id, next.length ? next : null);
            },
          },
          opt,
        );
      });
      return h('div', { class: 'ms-chips' }, chips);
    }

    // text | number | date
    var type = def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text';
    var input = h('input', {
      type: type,
      class: 'field-input',
      onChange: function (e) {
        var raw = String(e.target.value).trim();
        if (raw === '') {
          postField(cardId, def.id, null);
          return;
        }
        if (def.type === 'number') {
          var n = Number(raw);
          postField(cardId, def.id, isNaN(n) ? null : n);
        } else {
          postField(cardId, def.id, raw);
        }
      },
    });
    input.value = val != null ? String(val) : '';
    return input;
  }

  function modalFields(card) {
    var defs = fieldDefs();
    if (!defs.length) {
      return null;
    }
    var rows = defs.map(function (def) {
      return h('div', { class: 'field-row' }, [
        h('div', { class: 'field-row-label' }, fieldLabel(def)),
        fieldEditor(def, card),
      ]);
    });
    return h('div', { class: 'section' }, [
      h('div', { class: 'field-label' }, 'Fields'),
      h('div', { class: 'fields-grid' }, rows),
    ]);
  }

  // Human note under a gate row (requirement when unmet, evidence when met).
  function gateNote(card, def, sat) {
    switch (def.kind) {
      case 'checklist': {
        var list = card.checklist || [];
        var done = 0;
        list.forEach(function (x) {
          if (x.done) {
            done++;
          }
        });
        return 'Checklist ' + done + '/' + list.length;
      }
      case 'field': {
        var name = def.field || '';
        if (def.equals != null) {
          return 'Requires ' + name + ' = ' + def.equals;
        }
        return 'Requires ' + name + ' to be set';
      }
      case 'approval': {
        var by = def.by || [];
        if (sat) {
          var ev = gateEvidence(card, def.id);
          return 'Approved' + (ev && ev.note ? ' — ' + ev.note : '');
        }
        return by.length ? 'Needs approval by ' + by.join(', ') : 'Needs approval';
      }
      case 'command': {
        if (sat) {
          var e = gateEvidence(card, def.id);
          return e && e.note ? e.note : 'Passed';
        }
        return 'Run: ' + (def.run || def.id);
      }
      default:
        return '';
    }
  }

  function gateRow(card, def) {
    var sat = gateSatisfied(card, def);
    var status = sat
      ? h('span', { class: 'gate-status ok', html: ICON.check })
      : h('span', { class: 'gate-status' });
    var main = [
      h('div', { class: 'gate-label' }, gateLabel(def)),
      h('div', { class: 'gate-note' }, gateNote(card, def, sat)),
    ];
    var rowChildren = [status, h('div', { class: 'gate-main' }, main)];
    if (def.kind === 'approval' && !sat) {
      rowChildren.push(
        h(
          'button',
          {
            class: 'btn-primary gate-approve',
            onClick: function () {
              vscode.postMessage({
                type: 'approveGate',
                cardId: state.openCardId,
                gateId: def.id,
              });
            },
          },
          'Approve',
        ),
      );
    }
    return h('div', { class: 'gate-row' }, rowChildren);
  }

  function modalGates(card, col) {
    var b = board();
    var groups = [];
    if (col && col.exit && col.exit.length) {
      groups.push({ heading: 'To leave ' + col.name, gates: col.exit });
    }
    (b.columns || []).forEach(function (c) {
      if (col && c.id === col.id) {
        return;
      }
      if (c.enter && c.enter.length) {
        groups.push({ heading: 'To enter ' + c.name, gates: c.enter });
      }
    });
    if (!groups.length) {
      return null;
    }
    var blocks = groups.map(function (grp) {
      return h('div', { class: 'gate-group' }, [
        h('div', { class: 'gate-group-head' }, grp.heading),
        h(
          'div',
          { class: 'gate-list' },
          grp.gates.map(function (def) {
            return gateRow(card, def);
          }),
        ),
      ]);
    });
    return h('div', { class: 'section' }, [
      h('div', { class: 'field-label' }, 'Gates'),
      h('div', { class: 'gates' }, blocks),
    ]);
  }

  function buildModal() {
    var card = board().cards[state.openCardId];
    if (!card) {
      return null;
    }
    var col = columnOfCard(state.openCardId);

    var body = [
      modalLiveBanner(card),
      modalMeta(card),
      modalDescription(card),
      modalFields(card),
      modalChecklist(card),
      modalGates(card, col),
    ];

    var panel = h(
      'div',
      {
        class: 'modal',
        onClick: function (e) {
          e.stopPropagation();
        },
      },
      [modalHead(card, col), h('div', { class: 'modal-body' }, body)],
    );

    return h('div', { class: 'modal-overlay', onClick: closeModal }, [panel]);
  }

  function closeModal() {
    state.openCardId = null;
    render();
  }

  /* ---- Blocked-move dialog ---- */
  function closeBlocked() {
    state.blocked = null;
    render();
  }

  function overrideMove() {
    var lm = state.lastMove;
    state.blocked = null;
    if (lm) {
      vscode.postMessage({
        type: 'moveCard',
        cardId: lm.cardId,
        toColumn: lm.toColumn,
        index: lm.index,
        override: true,
      });
    }
    render();
  }

  function buildBlockedDialog() {
    var bl = state.blocked;
    if (!bl) {
      return null;
    }
    var col = columnById(bl.toColumn);
    var name = col ? col.name : bl.toColumn;
    var rows = (bl.results || []).map(function (r) {
      return h('div', { class: 'blocked-gate' }, [
        h('span', { class: 'gate-status' }),
        h('div', { class: 'gate-main' }, [
          h('div', { class: 'gate-label' }, r.label),
          h('div', { class: 'gate-note' }, r.reason),
        ]),
      ]);
    });
    var panel = h(
      'div',
      {
        class: 'modal blocked-modal',
        onClick: function (e) {
          e.stopPropagation();
        },
      },
      [
        h('div', { class: 'modal-head' }, [
          h('div', { class: 'modal-head-row' }, [
            h('div', { class: 'modal-head-main' }, [
              h('div', { class: 'modal-title blocked-title' }, "Can't move to " + name),
            ]),
            h('button', { class: 'modal-close', onClick: closeBlocked }, '✕'),
          ]),
        ]),
        h('div', { class: 'modal-body' }, [
          h('div', { class: 'blocked-gates' }, rows),
          h('div', { class: 'blocked-actions' }, [
            h('button', { class: 'btn-secondary', onClick: overrideMove }, 'Override & move'),
            h('button', { class: 'btn-primary', onClick: closeBlocked }, 'Cancel'),
          ]),
        ]),
      ],
    );
    return h('div', { class: 'modal-overlay', onClick: closeBlocked }, [panel]);
  }

  /* ---- Drag & drop ---- */
  function ensurePlaceholder() {
    if (!drag.placeholder) {
      drag.placeholder = h('div', { class: 'placeholder' });
    }
    return drag.placeholder;
  }

  function clearColumnHighlights() {
    var cols = document.querySelectorAll('.column.drag-target');
    for (var i = 0; i < cols.length; i++) {
      cols[i].classList.remove('drag-target');
    }
  }

  function highlightColumn(colEl) {
    clearColumnHighlights();
    if (colEl) {
      colEl.classList.add('drag-target');
    }
  }

  function onCardDragStart(e, cardId, cardEl) {
    drag.active = true;
    drag.cardId = cardId;
    drag.el = cardEl;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', cardId);
      } catch (err) {
        /* ignore */
      }
    }
    ensurePlaceholder();
    // Defer adding the dragging class so the drag image captures the full card.
    setTimeout(function () {
      if (drag.active && drag.el) {
        drag.el.classList.add('dragging');
      }
    }, 0);
  }

  function onCardDragOver(e, cardEl) {
    if (!drag.active) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    var list = cardEl.parentElement;
    if (!list) {
      return;
    }
    var ph = ensurePlaceholder();
    var r = cardEl.getBoundingClientRect();
    var before = e.clientY < r.top + r.height / 2;
    if (before) {
      list.insertBefore(ph, cardEl);
    } else {
      list.insertBefore(ph, cardEl.nextSibling);
    }
    var colEl = list.closest('.column');
    highlightColumn(colEl);
  }

  function onColumnDragOver(e, colEl, list) {
    if (!drag.active) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    var ph = ensurePlaceholder();
    // Only append when the placeholder is not already in this list (empty area / gaps).
    if (ph.parentElement !== list) {
      list.appendChild(ph);
    }
    highlightColumn(colEl);
  }

  // The DOM only shows cards passing the active search/agent filter, so a DOM
  // position is not a valid index into the column's full card list. Anchor the
  // drop on the first visible card after the placeholder, then find its slot
  // among ALL of the column's cards (minus the dragged one).
  function absoluteDropIndex(nextVisibleCardId, columnCardIds, draggedCardId) {
    var remaining = columnCardIds.filter(function (id) {
      return id !== draggedCardId;
    });
    var anchor = nextVisibleCardId ? remaining.indexOf(nextVisibleCardId) : -1;
    return anchor >= 0 ? anchor : remaining.length;
  }

  // Walk the list DOM to find the first real card after the placeholder.
  function nextVisibleCardAfterPlaceholder(list, ph) {
    var seenPh = false;
    var kids = list.children;
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (child === ph) {
        seenPh = true;
        continue;
      }
      if (seenPh && child.classList.contains('card') && child !== drag.el) {
        return child.dataset.cardId;
      }
    }
    return null;
  }

  function columnById(colId) {
    var b = board();
    if (!b) {
      return null;
    }
    for (var c = 0; c < b.columns.length; c++) {
      if (b.columns[c].id === colId) {
        return b.columns[c];
      }
    }
    return null;
  }

  function onColumnDrop(e) {
    if (!drag.active) {
      return;
    }
    e.preventDefault();
    var ph = drag.placeholder;
    if (!ph || !ph.parentElement) {
      onDragEnd();
      return;
    }
    var list = ph.parentElement;
    var colId = list.dataset.colId;
    var targetCol = columnById(colId);
    var index = targetCol
      ? absoluteDropIndex(nextVisibleCardAfterPlaceholder(list, ph), targetCol.cardIds, drag.cardId)
      : 0;
    var cardId = drag.cardId;
    cleanupDrag();
    // Stash the attempt so a blocked-move dialog can retry it with override.
    state.lastMove = { cardId: cardId, toColumn: colId, index: index };
    vscode.postMessage({ type: 'moveCard', cardId: cardId, toColumn: colId, index: index });
    // The resulting {type:'data'} message re-renders; a gate block replies with
    // {type:'moveBlocked'} instead and the card stays put.
  }

  function onDragEnd() {
    cleanupDrag();
    if (drag.pendingData) {
      var pending = drag.pendingData;
      drag.pendingData = null;
      applyData(pending);
    }
  }

  function cleanupDrag() {
    if (drag.placeholder && drag.placeholder.parentElement) {
      drag.placeholder.parentElement.removeChild(drag.placeholder);
    }
    if (drag.el) {
      drag.el.classList.remove('dragging');
    }
    clearColumnHighlights();
    drag.active = false;
    drag.cardId = null;
    drag.el = null;
    drag.placeholder = null;
  }

  /* ---- Render ---- */
  function render() {
    if (drag.active) {
      return; // never re-render mid-drag
    }
    var app = document.getElementById('app');
    if (!app) {
      return;
    }

    // Preserve search focus + caret across the rebuild.
    var active = document.activeElement;
    var restoreSearch = active && active.id === 'search-input';
    var caretStart = restoreSearch ? active.selectionStart : 0;
    var caretEnd = restoreSearch ? active.selectionEnd : 0;

    while (app.firstChild) {
      app.removeChild(app.firstChild);
    }

    if (!state.data) {
      return;
    }

    // Drop a stale open card.
    if (state.openCardId && !board().cards[state.openCardId]) {
      state.openCardId = null;
    }

    app.appendChild(buildTopBar());
    app.appendChild(buildCanvas());
    app.appendChild(buildStatusBar());

    if (state.openCardId) {
      var modal = buildModal();
      if (modal) {
        app.appendChild(modal);
      }
    }

    if (state.blocked) {
      var dialog = buildBlockedDialog();
      if (dialog) {
        app.appendChild(dialog);
      }
    }

    if (restoreSearch) {
      var input = document.getElementById('search-input');
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(caretStart, caretEnd);
        } catch (err) {
          /* ignore */
        }
      }
    } else if (state.addingCol) {
      var ta = document.getElementById('composer-' + state.addingCol);
      if (ta) {
        ta.focus();
        var len = ta.value.length;
        try {
          ta.setSelectionRange(len, len);
        } catch (err2) {
          /* ignore */
        }
      }
    }
  }

  function applyData(payload) {
    state.data = payload;
    // Drop filter for an agent that no longer exists.
    if (state.filterAgent && !agentDef(state.filterAgent)) {
      state.filterAgent = null;
    }
    render();
  }

  /* ---- Messaging ---- */
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg) {
      return;
    }
    if (msg.type === 'openCard' && typeof msg.cardId === 'string') {
      // Host-driven card open (tests / automation) — mirrors a card click.
      state.openCardId = msg.cardId;
      if (state.data) {
        render();
      }
      return;
    }
    if (msg.type === 'moveBlocked' && typeof msg.cardId === 'string') {
      // A gated move was refused; surface the unmet gates with an override path.
      // The drop already ended, so drag.active is false — safe to render now.
      state.blocked = {
        cardId: msg.cardId,
        toColumn: msg.toColumn,
        results: Array.isArray(msg.results) ? msg.results : [],
      };
      if (state.data) {
        render();
      }
      return;
    }
    if (msg.type !== 'data') {
      return;
    }
    if (drag.active) {
      drag.pendingData = msg; // apply after the drag finishes
      return;
    }
    applyData(msg);
  });

  vscode.postMessage({ type: 'ready' });
})();
