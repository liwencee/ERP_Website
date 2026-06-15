(function () {
  var widget = document.getElementById('chatbotWidget');
  if (!widget) return;

  var fab = document.getElementById('chatbotFab');
  var panel = document.getElementById('chatbotPanel');
  var closeBtn = document.getElementById('chatbotClose');
  var messagesEl = document.getElementById('chatbotMessages');
  var quickRepliesEl = document.getElementById('chatbotQuickReplies');
  var form = document.getElementById('chatbotForm');
  var input = document.getElementById('chatbotInput');
  var badge = document.getElementById('chatbotBadge');

  var STORAGE_KEY = 'eprChatHistory';
  var opened = false;

  var GREETING = "👋 Hi! I'm the EPR Assistant. I can help with investment plans & rates, account setup, KYC, withdrawals, referrals and more — what would you like to know?";
  var MAIN_MENU = ['Investment plans & rates', 'Suggest a plan for my budget', 'How do I open an account?', 'Is EPR Access regulated?', 'Talk to a human'];

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function saveHistory(history) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) { /* ignore */ }
  }

  function loadHistory() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }

  var history = loadHistory();

  function addMessage(role, text, opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'chat-msg ' + role;

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);

    if (opts.link && opts.link.href) {
      var a = document.createElement('a');
      a.className = 'chat-link-btn';
      a.href = opts.link.href;
      a.textContent = opts.link.label + ' →';
      row.appendChild(a);
    }

    messagesEl.appendChild(row);
    scrollToBottom();
    return row;
  }

  function setQuickReplies(list) {
    quickRepliesEl.innerHTML = '';
    (list || []).forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chatbot-chip';
      btn.textContent = label;
      btn.addEventListener('click', function () { sendMessage(label); });
      quickRepliesEl.appendChild(btn);
    });
  }

  function showTyping() {
    var row = document.createElement('div');
    row.className = 'chat-msg bot typing';
    row.id = 'chatbotTyping';
    row.innerHTML = '<div class="chat-bubble"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function hideTyping() {
    var t = document.getElementById('chatbotTyping');
    if (t) t.remove();
  }

  function sendMessage(text) {
    text = (text || '').trim();
    if (!text) return;

    addMessage('user', text);
    history.push({ role: 'user', text: text });
    saveHistory(history);
    setQuickReplies([]);
    input.value = '';
    showTyping();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        hideTyping();
        addMessage('bot', data.reply, { link: data.link });
        setQuickReplies(data.quickReplies);
        history.push({ role: 'bot', text: data.reply, quickReplies: data.quickReplies, link: data.link });
        saveHistory(history);
      })
      .catch(function () {
        hideTyping();
        addMessage('bot', "Sorry, I'm having trouble connecting right now. Please try again or reach us directly.", { link: { label: 'Chat on WhatsApp', href: 'https://wa.me/2348036660392' } });
      });
  }

  function openChat() {
    widget.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    if (badge) badge.style.display = 'none';

    if (!opened) {
      opened = true;

      if (history.length) {
        history.forEach(function (m, i) {
          addMessage(m.role, m.text, { link: m.link });
          if (m.role === 'bot' && i === history.length - 1 && m.quickReplies) {
            setQuickReplies(m.quickReplies);
          }
        });
      } else {
        showTyping();
        setTimeout(function () {
          hideTyping();
          addMessage('bot', GREETING);
          setQuickReplies(MAIN_MENU);
          history.push({ role: 'bot', text: GREETING, quickReplies: MAIN_MENU });
          saveHistory(history);
        }, 450);
      }
    }

    setTimeout(function () { input.focus(); }, 300);
  }

  function closeChat() {
    widget.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  }

  fab.addEventListener('click', function () {
    if (widget.classList.contains('open')) {
      closeChat();
    } else {
      openChat();
    }
  });

  closeBtn.addEventListener('click', closeChat);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    sendMessage(input.value);
  });
})();
