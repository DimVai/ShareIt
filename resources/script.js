'use strict';

(() => {
  /* ---------- τοπική υποδιαστολή (σύμφωνα με τον browser) ---------- */
  const DECIMAL_SEP = (() => {
    try {
      const part = new Intl.NumberFormat().formatToParts(1.1).find(p => p.type === 'decimal');
      return part ? part.value : '.';
    } catch (e) {
      return '.';
    }
  })();

  const moneyFmt = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  /*   = άσπαστο κενό, ώστε το € να μη μένει μόνο του σε νέα γραμμή */
  const fmtMoney = cents => moneyFmt.format(cents / 100) + ' €';
  const ZERO_PLACEHOLDER = '0' + DECIMAL_SEP + '00';

  const LS_KEY = 'shareit';
  const state = { billRaw: '', discountRaw: '', discountUsed: false, people: [], nextId: 1 };

  /* ---------- στοιχεία σελίδας ---------- */
  const $ = id => document.getElementById(id);
  const billInput = $('billTotal');
  const useDiscountBtn = $('useDiscountBtn');
  const discountField = $('discountField');
  const discountInput = $('discountAmount');
  const addForm = $('addForm');
  const nameInput = $('personName');
  const amountInput = $('personAmount');
  const peopleList = $('peopleList');
  const peopleCount = $('peopleCount');
  const sumRow = $('sumRow');
  const personalSumEl = $('personalSum');
  const sharedTotalEl = $('sharedTotal');
  const sharedEachEl = $('sharedEach');
  const warningEl = $('warning');
  const resultsHint = $('resultsHint');
  const resultsList = $('resultsList');
  const grandRow = $('grandRow');
  const grandTotalEl = $('grandTotal');
  const roundNoteEl = $('roundNote');
  const clearAmountsBtn = $('clearAmountsBtn');
  const clearPeopleBtn = $('clearPeopleBtn');
  const beforeDiscountEls = document.querySelectorAll('.before-discount');

  /* ---------- καθαρισμός ποσών ----------
     Κρατά μόνο ψηφία και μία υποδιαστολή (κόμμα ή τελεία),
     τη μετατρέπει στην υποδιαστολή του browser
     και κόβει στα 2 δεκαδικά. */
  function sanitizeAmountString(raw) {
    let out = '';
    let sepSeen = false;
    let decimals = 0;
    for (const ch of String(raw || '')) {
      if (ch >= '0' && ch <= '9') {
        if (sepSeen) {
          if (decimals < 2) {
            out += ch;
            decimals++;
          }
        } else {
          out += ch;
        }
      } else if ((ch === '.' || ch === ',') && !sepSeen) {
        sepSeen = true;
        out += DECIMAL_SEP;
      }
    }
    return out;
  }

  function sanitizeAmountField(el) {
    const raw = el.value;
    const out = sanitizeAmountString(raw);
    if (out !== raw) {
      const caretRaw = el.selectionStart;
      const caret = caretRaw === null
        ? out.length
        : sanitizeAmountString(raw.slice(0, caretRaw)).length;
      el.value = out;
      if (document.activeElement === el) {
        try { el.setSelectionRange(caret, caret); } catch (e) { /* τίποτα */ }
      }
    }
    return el.value;
  }

  /* Μετατροπή σε λεπτά (ακέραιος) για ακριβείς πράξεις */
  function toCents(str) {
    if (!str) return 0;
    const v = parseFloat(String(str).split(DECIMAL_SEP).join('.').replace(',', '.'));
    return Number.isFinite(v) ? Math.round(v * 100) : 0;
  }

  function bindAmountInput(el, onChange) {
    el.placeholder = ZERO_PLACEHOLDER;
    el.addEventListener('input', () => onChange(sanitizeAmountField(el)));
  }

  /* ---------- αποθήκευση στη συσκευή ---------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        billRaw: state.billRaw,
        discountRaw: state.discountRaw,
        discountUsed: state.discountUsed,
        people: state.people,
        nextId: state.nextId
      }));
    } catch (e) { /* π.χ. ιδιωτική περιήγηση */ }
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_KEY));
      if (!data || typeof data !== 'object') return;
      state.billRaw = sanitizeAmountString(typeof data.billRaw === 'string' ? data.billRaw : '');
      state.discountRaw = sanitizeAmountString(typeof data.discountRaw === 'string' ? data.discountRaw : '');
      state.discountUsed = data.discountUsed === true;
      if (Array.isArray(data.people)) {
        for (const p of data.people) {
          if (!p || typeof p.name !== 'string') continue;
          state.people.push({
            id: Number.isInteger(p.id) ? p.id : state.nextId,
            name: p.name.slice(0, 20),
            amountRaw: sanitizeAmountString(typeof p.amountRaw === 'string' ? p.amountRaw : '')
          });
        }
      }
      for (const p of state.people) {
        if (p.id >= state.nextId) state.nextId = p.id + 1;
      }
    } catch (e) { /* κατεστραμμένα δεδομένα — αγνόησέ τα */ }
  }

  /* ---------- βοηθητικά ---------- */
  const initialOf = name => (String(name).trim()[0] || '?').toLocaleUpperCase('el-GR');

  function defaultName() {
    let max = 0;
    for (const p of state.people) {
      const m = /^Άτομο (\d+)$/u.exec(p.name);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return 'Άτομο ' + (max + 1);
  }

  /* ---------- λίστα ατόμων ---------- */
  function renderPeople() {
    peopleList.textContent = '';

    state.people.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'person';

      const av = document.createElement('span');
      av.className = 'avatar ' + (i % 2 === 0 ? 'av-orange' : 'av-blue');
      av.textContent = initialOf(p.name);

      const nm = document.createElement('span');
      nm.className = 'p-name';
      nm.textContent = p.name;
      nm.title = p.name;

      const field = document.createElement('div');
      field.className = 'money-field';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.autocomplete = 'off';
      inp.maxLength = 10;
      inp.className = 'input row-amount';
      inp.value = p.amountRaw;
      inp.setAttribute('aria-label', 'Ατομικό ποσό για: ' + p.name);
      bindAmountInput(inp, v => {
        p.amountRaw = v;
        save();
        recalc();
      });
      const cur = document.createElement('span');
      cur.className = 'cur';
      cur.textContent = '€';
      field.append(inp, cur);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Αφαίρεση: ' + p.name);
      del.addEventListener('click', () => {
        state.people = state.people.filter(x => x.id !== p.id);
        save();
        renderPeople();
        recalc();
      });

      li.append(av, nm, field, del);
      peopleList.appendChild(li);
    });

    const n = state.people.length;
    peopleCount.hidden = n === 0;
    peopleCount.textContent = n;
  }

  /* ---------- υπολογισμοί & αποτελέσματα ---------- */
  function recalc() {
    /* billTotal: το τελικό ποσό που πρέπει να πληρωθεί συνολικά (μετά από τυχόν έκπτωση).
       billBeforeDiscount: το ισοδύναμο πριν την έκπτωση — η βάση πάνω στην οποία μοιράζονται
       τα ατομικά και τα κοινά ποσά (όπως στην τιμή χωρίς έκπτωση).
       effectiveFactor: billTotal / billBeforeDiscount — η έκπτωση μοιράζεται αναλογικά στο τέλος
       κάθε ατόμου (όταν δεν υπάρχει έκπτωση ισούται με 1, χωρίς ιδιαίτερο κλάδο). */
    const billTotal = toCents(state.billRaw);
    const discount = toCents(state.discountRaw);
    const billBeforeDiscount = billTotal + discount;
    const effectiveFactor = billTotal / billBeforeDiscount;
    const n = state.people.length;
    const personalSum = state.people.reduce((s, p) => s + toCents(p.amountRaw), 0);
    const shared = billBeforeDiscount - personalSum;
    const hasBill = billBeforeDiscount > 0;

    for (const el of beforeDiscountEls) el.hidden = discount <= 0;

    sumRow.hidden = n === 0;
    personalSumEl.textContent = fmtMoney(personalSum);

    /* κάρτα κοινών */
    if (!hasBill) {
      sharedTotalEl.textContent = '—';
      sharedTotalEl.classList.remove('neg');
      sharedEachEl.textContent = '—';
      warningEl.hidden = true;
    } else {
      sharedTotalEl.textContent = fmtMoney(shared);
      sharedTotalEl.classList.toggle('neg', shared < 0);
      sharedEachEl.textContent = (n > 0 && shared >= 0) ? fmtMoney(Math.ceil(shared / n)) : '—';
      if (shared < 0) {
        warningEl.textContent = 'Προσοχή: τα ατομικά ποσά (' + fmtMoney(personalSum) +
          ') ξεπερνούν τον λογαριασμό κατά ' + fmtMoney(-shared) + '.';
        warningEl.hidden = false;
      } else {
        warningEl.hidden = true;
      }
    }

    /* κάρτα μοιράσματος */
    resultsList.textContent = '';
    grandRow.hidden = true;

    let hint = '';
    if (!hasBill) hint = 'Γράψε το συνολικό ποσό του λογαριασμού για να ξεκινήσεις.';
    else if (n === 0) hint = 'Πρόσθεσε τα άτομα της παρέας για να δεις το μοίρασμα.';
    else if (shared < 0) hint = 'Διόρθωσε τα ποσά για να υπολογιστεί το μοίρασμα.';

    if (hint) {
      resultsHint.textContent = hint;
      resultsHint.hidden = false;
      return;
    }
    resultsHint.hidden = true;

    /* στρογγυλοποίηση προς τα πάνω στο λεπτό: το άθροισμα βγαίνει πάντα ≥ του λογαριασμού */
    const sharedEach = Math.ceil(shared / n);
    let sumRounded = 0;

    state.people.forEach((p, i) => {
      const personal = toCents(p.amountRaw);
      const grossTotal = personal + sharedEach;
      const total = Math.ceil(grossTotal * effectiveFactor);
      const personDiscount = grossTotal - total;
      sumRounded += total;

      const li = document.createElement('li');
      li.className = 'result';

      const av = document.createElement('span');
      av.className = 'avatar ' + (i % 2 === 0 ? 'av-orange' : 'av-blue');
      av.textContent = initialOf(p.name);

      const mid = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'res-name';
      nm.textContent = p.name;
      const br = document.createElement('div');
      br.className = 'res-breakdown';
      const lines = ['Ατομικά: ' + fmtMoney(personal), 'Κοινά: ' + fmtMoney(sharedEach)];
      if (discount > 0) lines.push('Έκπτωση: -' + fmtMoney(personDiscount));
      for (const line of lines) {
        const lineEl = document.createElement('span');
        lineEl.textContent = line;
        br.appendChild(lineEl);
      }
      mid.append(nm, br);

      const tot = document.createElement('span');
      tot.className = 'res-total';
      tot.textContent = fmtMoney(total);

      li.append(av, mid, tot);
      resultsList.appendChild(li);
    });

    grandTotalEl.textContent = fmtMoney(sumRounded);
    const diff = sumRounded - billTotal;
    if (diff === 0) {
      roundNoteEl.textContent = '✓ Ίσο με τον λογαριασμό';
      roundNoteEl.classList.add('ok');
    } else {
      roundNoteEl.textContent = 'Διαφορά στρογγυλοποίησης +' + fmtMoney(diff);
      roundNoteEl.classList.remove('ok');
    }
    grandRow.hidden = false;
  }

  /* ---------- συμβάντα ---------- */
  bindAmountInput(billInput, v => {
    state.billRaw = v;
    save();
    recalc();
  });

  bindAmountInput(discountInput, v => {
    state.discountRaw = v;
    save();
    recalc();
  });

  useDiscountBtn.addEventListener('click', () => {
    state.discountUsed = true;
    useDiscountBtn.hidden = true;
    discountField.hidden = false;
    save();
    discountInput.focus();
  });

  bindAmountInput(amountInput, () => { /* μόνο καθαρισμός κατά την πληκτρολόγηση */ });

  billInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInput.focus();
    }
  });

  discountInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInput.focus();
    }
  });

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      amountInput.focus();
    }
  });

  addForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = nameInput.value.trim() || defaultName();
    state.people.push({
      id: state.nextId++,
      name,
      amountRaw: sanitizeAmountString(amountInput.value)
    });
    nameInput.value = '';
    amountInput.value = '';
    save();
    renderPeople();
    recalc();
    nameInput.focus();
  });

  /* κουμπιά καθαρισμού με διπλό πάτημα επιβεβαίωσης
     (χωρίς μπλοκάρισμα από native διάλογο) */
  function armable(btn, label, onConfirm) {
    let armed = false;
    let timer = 0;
    const disarm = () => {
      armed = false;
      clearTimeout(timer);
      btn.textContent = label;
      btn.classList.remove('armed');
    };
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = 'Επιβεβαίωση';
        btn.classList.add('armed');
        timer = setTimeout(disarm, 3500);
        return;
      }
      disarm();
      onConfirm();
    });
  }

  /* «Νέος λογαριασμός»: καθαρίζει όλα τα ποσά, κρατάει τα ονόματα */
  armable(clearAmountsBtn, 'Νέος λογαριασμός', () => {
    state.billRaw = '';
    billInput.value = '';
    state.discountRaw = '';
    discountInput.value = '';
    state.discountUsed = false;
    useDiscountBtn.hidden = false;
    discountField.hidden = true;
    for (const p of state.people) p.amountRaw = '';
    amountInput.value = '';
    save();
    renderPeople();
    recalc();
    billInput.focus();
  });

  /* «Νέα παρέα»: διαγράφει όλα τα άτομα */
  armable(clearPeopleBtn, 'Νέα παρέα', () => {
    state.people = [];
    state.nextId = 1;
    nameInput.value = '';
    amountInput.value = '';
    save();
    renderPeople();
    recalc();
    nameInput.focus();
  });

  /* ---------- εκκίνηση ---------- */
  load();
  billInput.value = state.billRaw;
  discountInput.value = state.discountRaw;
  if (state.discountUsed) {
    useDiscountBtn.hidden = true;
    discountField.hidden = false;
  }
  renderPeople();
  recalc();
})();
