
if (typeof URL !== 'undefined' && typeof URL.canParse !== 'function') {
  URL.canParse = function (url, base) {
    try {
      new URL(url, base);
      return true;
    } catch (e) {
      return false;
    }
  };
}

(function () {
  'use strict';

  const MOBILE_MAX = 768;
  const MAX_INIT_RETRIES = 240;
  const RESIZE_DEBOUNCE_MS = 120;

  let observers = [];
  let initRaf = 0;
  let resizeTimer = 0;
  let pageDomObserver = null;


  const PROFILE_ASSETS = Object.assign({
    i18nBaseUrl: '/plugins/nodebb-theme-peipe-xhs/peipe-xprofile-v19/i18n/',
    i18nDefault: 'zh-CN',
    imageConfig: {
      maxSide: 1080,
      maxSizeMB: 0.09,
      quality: 0.58,
      minCompressBytes: 70 * 1024,
      useWebp: true,
      qualities: [0.58, 0.50, 0.44, 0.38, 0.32, 0.26, 0.22]
    },
    avatarImageConfig: {
      maxSide: 512,
      maxSizeMB: 0.06,
      quality: 0.56,
      minCompressBytes: 45 * 1024,
      useWebp: true,
      qualities: [0.56, 0.48, 0.40, 0.34, 0.28, 0.22]
    }
  }, window.PEIPE_XPROFILE_CONFIG || window.PEIPE_PROFILE_CONFIG || {});

  const DEFAULT_PROFILE_TEXT = {
    review: '评价',
    notes: '笔记',
    followingCount: '关注',
    followers: '粉丝',
    views: '浏览',
    editProfile: '编辑资料',
    backHome: '返回主页',
    chat: '聊天',
    follow: '关注',
    following: '已关注',
    more: '更多',
    settings: '设置',
    themeSettings: '主题设置',
    uploadAvatar: '上传头像',
    uploadCover: '上传背景',
    resizeCover: '调整背景',
    removeCover: '移除背景',
    accountInfo: '账号信息',
    muteAccount: '禁言账号',
    unmuteAccount: '解除禁言',
    banAccount: '封禁账号',
    unbanAccount: '解除封禁',
    deleteAccount: '删除账号',
    deleteContent: '删除内容',
    deleteAll: '删除账号和内容',
    reportProfile: '举报资料',
    reported: '已举报',
    blockUser: '屏蔽用户',
    unblockUser: '解除屏蔽',
    ageSuffix: '岁',
    compressing: '正在压缩图片...',
    uploading: '上传中...',
    notesLoading: '正在加载笔记...',
    notesEmpty: '还没有笔记',
    noteOpen: '打开笔记',
    reviewSummary: '综合评分',
    reviewCount: '人评价',
    reviewTitle: '语伴评价',
    reviewPlaceholder: '写一句真实印象，最多240字',
    reviewSubmit: '发布评价',
    reviewSaving: '发布中...',
    reviewEmpty: '还没有评价',
    reviewLogin: '请先登录后评价',
    reviewSaved: '评价已保存',
    reviewFail: '评价失败',
    reviewAnonymous: '匿名评价',
    reviewUnder24h: '聊天未满 24 小时，暂时不能评价',
    partnerProfileTitle: '编辑语伴资料',
    profileSubtitle: '这些资料会展示在语伴卡片和个人主页。',
    displayName: '用户名 / 显示名',
    bio: '介绍',
    bioPlaceholder: '介绍一下你想练什么语言、喜欢聊什么。',
    country: '国籍 / 地区',
    nativeLanguage: '母语 / 我会说',
    learningLanguage: '想学语言',
    gender: '性别',
    birthday: '出生日期',
    height: '身高',
    weight: '体重',
    education: '学历',
    occupation: '职业',
    relationship: '感情状况',
    optional: '选填',
    tags: '标签',
    chooseTags: '选择标签',
    save: '保存资料',
    leave: '离开',
    saving: '保存中...',
    saveOk: '资料已保存',
    saveFail: '保存失败',
    loading: '加载中...',
    male: '男',
    female: '女',
    privateGender: '保密',
    selectPlaceholder: '请选择',
    chooseOption: '请选择',
    doneOption: '保存',
    selectedCount: '已选',
    missingPrefix: '请先补全：'
  };

  let profileText = Object.assign({}, DEFAULT_PROFILE_TEXT, window.PEIPE_XPROFILE_TEXT || window.PEIPE_XPROFILE_TEXT || window.PEIPE_PROFILE_TEXT || {});
  let profileI18nPromise = null;
  let profileAssetsReady = false;
  let uploadCompressionInstalled = false;

  // Start hiding early when this script loads on a mobile user page.
  installCriticalNoFlickerStyle();
  if (window.innerWidth <= MOBILE_MAX && /^\/user\//.test(location.pathname || '')) {
    document.body.classList.remove('pxp19-profile-disabled');
    document.body.classList.add('pxp19-profile-booting');
  }

  function ensureExternalCss() {
    // CSS is compiled by plugin.json -> scss/peipe-xprofile-v19.scss. Do not inject a second CSS link.
    return;
  }

  function getLocaleCandidates() {
    const raw = String(
      (window.config && (window.config.userLang || window.config.language)) ||
      document.documentElement.lang ||
      navigator.language ||
      PROFILE_ASSETS.i18nDefault ||
      'zh-CN'
    );
    const normalized = raw.replace('_', '-');
    const short = normalized.split('-')[0];
    const out = [];
    [normalized, raw, short, PROFILE_ASSETS.i18nDefault, 'zh-CN', 'zh', 'en-US', 'en'].forEach(function (item) {
      item = String(item || '').trim();
      if (item && out.indexOf(item) === -1) out.push(item);
    });
    return out;
  }

  function loadProfileI18n() {
    if (profileI18nPromise) return profileI18nPromise;
    const candidates = getLocaleCandidates();
    let chain = Promise.reject(new Error('start'));
    candidates.forEach(function (locale) {
      chain = chain.catch(function () {
        const cacheKey = (window.config && (window.config['cache-buster'] || window.config.cacheBuster)) || Date.now();
        return fetch(rel(PROFILE_ASSETS.i18nBaseUrl + locale + '.json?v=' + cacheKey), {
          credentials: 'same-origin',
          cache: 'no-store'
        }).then(function (res) {
          if (!res.ok) throw new Error('i18n ' + locale + ' ' + res.status);
          return res.json();
        });
      });
    });
    profileI18nPromise = chain.then(function (json) {
      profileText = Object.assign({}, DEFAULT_PROFILE_TEXT, window.PEIPE_XPROFILE_TEXT || window.PEIPE_PROFILE_TEXT || {}, json || {});
      profileAssetsReady = true;
      return profileText;
    }).catch(function (err) {
      console.warn('[peipe-xprofile-v19] i18n load failed, using built-in zh-CN fallback', err);
      profileText = Object.assign({}, DEFAULT_PROFILE_TEXT, window.PEIPE_XPROFILE_TEXT || window.PEIPE_PROFILE_TEXT || {});
      profileAssetsReady = true;
      return profileText;
    });
    return profileI18nPromise;
  }

  function T(key, vars) {
    let value = profileText && profileText[key];
    if (!value && window.PEIPE_PROFILE_TEXT) value = window.PEIPE_PROFILE_TEXT[key];
    if (!value) value = DEFAULT_PROFILE_TEXT[key];
    value = value || key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = String(value).replace(new RegExp('\\{\\{' + name + '\\}\\}', 'g'), vars[name]);
      });
    }
    return value;
  }


  function rel(path) {
    const base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    if (/^https?:\/\//i.test(path)) return path;
    if (base && path.indexOf(base + '/') === 0) return path;
    return base + path;
  }

  function csrfToken() {
    return (window.config && (window.config.csrf_token || window.config.csrfToken)) ||
      (document.querySelector('meta[name="csrf-token"]') && document.querySelector('meta[name="csrf-token"]').getAttribute('content')) || '';
  }

  function installCriticalNoFlickerStyle() {
    if (document.getElementById('pxp19-critical-style')) return;
    const style = document.createElement('style');
    style.id = 'pxp19-critical-style';
    style.textContent = '@media (max-width:768px){body[class*=page-user].pxp19-profile-booting [component="bottombar"],body[class*=page-user].pxp19-profile-booting .sidebar-left,body[class*=page-user].pxp19-profile-booting .sidebar-right,body[class*=page-user].pxp19-profile-booting .fixed-bottom,body[class*=page-user].pxp19-profile-active [component="bottombar"],body[class*=page-user].pxp19-profile-active .sidebar-left,body[class*=page-user].pxp19-profile-active .sidebar-right,body[class*=page-user].pxp19-profile-active .fixed-bottom{display:none!important}body[class*=page-user].pxp19-profile-booting main#panel,body[class*=page-user].pxp19-profile-active main#panel{margin-top:0!important;padding-top:0!important}body[class*=page-user].pxp19-profile-booting .account{visibility:hidden!important;min-height:100vh}body[class*=page-user].pxp19-profile-ready .account,body[class*=page-user].pxp19-profile-active .account{visibility:visible!important}}';
    document.head.appendChild(style);
  }

  function toastProfile(text) {
    try {
      const body = document.body;
      body.classList.add('pxp19-profile-uploading');
      body.setAttribute('data-pxp19-uploading-text', text || T('uploading'));
      clearTimeout(body._xhsUploadToastTimer);
      body._xhsUploadToastTimer = setTimeout(function () {
        body.classList.remove('pxp19-profile-uploading');
        body.removeAttribute('data-pxp19-uploading-text');
      }, 1800);
    } catch (e) {}
  }

  function fileExt(file) {
    const name = String(file && file.name || '').toLowerCase();
    const m = name.match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function isCompressibleImage(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    const ext = fileExt(file);
    if (/gif|svg|heic|heif/i.test(type) || /^(gif|svg|heic|heif)$/i.test(ext)) return false;
    if (/^image\//i.test(type)) return true;
    return /^(jpg|jpeg|png|webp)$/i.test(ext);
  }

  function canEncode(type) {
    return new Promise(function (resolve) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        if (!canvas.toBlob) return resolve(false);
        canvas.toBlob(function (blob) { resolve(!!blob && blob.type === type); }, type, 0.8);
      } catch (e) { resolve(false); }
    });
  }

  function imageTargetBytes(cfg) {
    return Math.max(28 * 1024, Math.round(Number(cfg.maxSizeMB || 0.09) * 1024 * 1024));
  }

  function extForMime(type) {
    type = String(type || '').toLowerCase();
    if (type === 'image/webp') return '.webp';
    if (type === 'image/png') return '.png';
    return '.jpg';
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('empty file'));
      function fallback() {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            draw: function (ctx, w, h) { ctx.drawImage(img, 0, 0, w, h); },
            close: function () {}
          });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
        img.src = url;
      }
      if (window.createImageBitmap) {
        window.createImageBitmap(file).then(function (bitmap) {
          resolve({
            width: bitmap.width,
            height: bitmap.height,
            draw: function (ctx, w, h) { ctx.drawImage(bitmap, 0, 0, w, h); },
            close: function () { try { bitmap.close && bitmap.close(); } catch (e) {} }
          });
        }).catch(fallback);
      } else {
        fallback();
      }
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  function makeCompressedFile(original, blob, type) {
    if (!blob || !blob.size) return original;
    const base = String(original && original.name || ('image-' + Date.now())).replace(/\.[^.]+$/, '');
    try { return new File([blob], base + extForMime(type), { type: type, lastModified: Date.now() }); }
    catch (e) { blob.name = base + extForMime(type); return blob; }
  }

  function compressImageFile(file, cfg) {
    cfg = Object.assign({}, PROFILE_ASSETS.imageConfig, cfg || {});
    if (!isCompressibleImage(file)) return Promise.resolve(file);
    if (Number(file.size || 0) > 0 && Number(file.size || 0) < Number(cfg.minCompressBytes || 0)) return Promise.resolve(file);

    return canEncode('image/webp').then(function (webp) {
      const type = cfg.useWebp && webp ? 'image/webp' : 'image/jpeg';
      const targetBytes = imageTargetBytes(cfg);
      return loadImageFromFile(file).then(function (img) {
        const w = img.width || 1;
        const h = img.height || 1;
        const maxSide = Number(cfg.maxSide || 1080);
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.toBlob) return file;
        img.draw(ctx, canvas.width, canvas.height);
        img.close && img.close();

        const qualities = Array.isArray(cfg.qualities) && cfg.qualities.length ? cfg.qualities : [cfg.quality || 0.58, 0.50, 0.44, 0.38, 0.32, 0.26, 0.22];
        let best = null;
        let chain = Promise.resolve();
        qualities.forEach(function (q) {
          chain = chain.then(function () {
            if (best && best.size <= targetBytes) return best;
            return canvasToBlob(canvas, type, Number(q)).then(function (blob) {
              if (blob && blob.size) best = blob;
              return best;
            });
          });
        });
        return chain.then(function () {
          if (!best || !best.size) return file;
          if (Number(file.size || 0) && best.size >= Number(file.size || 0) * 0.98) return file;
          return makeCompressedFile(file, best, type);
        });
      });
    }).catch(function (err) {
      console.warn('[peipe-xprofile-v19] image compression skipped', err);
      return file;
    });
  }

  function shouldUseAvatarConfig(url) {
    const s = String(url || '').toLowerCase();
    return /avatar|picture|profile|user/.test(s);
  }

  function cloneAndCompressFormData(fd, url) {
    if (!fd || fd.__pxp19ProfileCompressed) return Promise.resolve(fd);
    const cfg = shouldUseAvatarConfig(url) ? PROFILE_ASSETS.avatarImageConfig : PROFILE_ASSETS.imageConfig;
    const next = new FormData();
    const tasks = [];
    fd.forEach(function (value, key) {
      if (value instanceof File && isCompressibleImage(value)) {
        tasks.push(compressImageFile(value, cfg).then(function (compressed) {
          next.append(key, compressed, compressed.name || value.name || 'image.jpg');
        }));
      } else if (value instanceof Blob && value.type && /^image\//i.test(value.type)) {
        tasks.push(compressImageFile(value, cfg).then(function (compressed) {
          next.append(key, compressed, compressed.name || 'image.jpg');
        }));
      } else {
        next.append(key, value);
      }
    });
    return Promise.all(tasks).then(function () {
      try { Object.defineProperty(next, '__pxp19ProfileCompressed', { value: true }); } catch (e) { next.__pxp19ProfileCompressed = true; }
      return next;
    });
  }

  function installUploadCompressionPatch() {
    if (uploadCompressionInstalled) return;
    uploadCompressionInstalled = true;

    if (window.fetch && !window.fetch.__pxp19ProfileCompressionPatched) {
      const rawFetch = window.fetch;
      const patchedFetch = function (input, init) {
        init = init || {};
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (init.body instanceof FormData) {
          toastProfile(T('compressing'));
          return cloneAndCompressFormData(init.body, url).then(function (body) {
            init.body = body;
            toastProfile(T('uploading'));
            return rawFetch.call(this, input, init);
          }).catch(function () {
            return rawFetch.call(this, input, init);
          });
        }
        return rawFetch.apply(this, arguments);
      };
      patchedFetch.__pxp19ProfileCompressionPatched = true;
      window.fetch = patchedFetch;
    }

    if (window.XMLHttpRequest && !window.XMLHttpRequest.prototype.__pxp19ProfileCompressionPatched) {
      const rawOpen = window.XMLHttpRequest.prototype.open;
      const rawSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        this.__pxp19ProfileUploadUrl = url;
        return rawOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function (body) {
        if (body instanceof FormData && !body.__pxp19ProfileCompressed) {
          const xhr = this;
          toastProfile(T('compressing'));
          cloneAndCompressFormData(body, xhr.__pxp19ProfileUploadUrl || '').then(function (nextBody) {
            toastProfile(T('uploading'));
            rawSend.call(xhr, nextBody);
          }).catch(function () {
            rawSend.call(xhr, body);
          });
          return;
        }
        return rawSend.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.__pxp19ProfileCompressionPatched = true;
    }
  }

  $(window).on('action:ajaxify.end', function () {
    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
      document.body.classList.add('pxp19-profile-disabled');
      return;
    }
    scheduleInit();
  });

  $(document).ready(function () {
    if (location.pathname.indexOf('/user/') === 0) {
      scheduleInit();
    }
  });

  $(window).on('resize', function () {
    if (!isAccountPage()) return;

    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = 0;
    }

    resizeTimer = setTimeout(function () {
      resizeTimer = 0;
      if (window.innerWidth > MOBILE_MAX) {
        cleanupInjected();
        restoreGlobalUI();
      } else {
        scheduleInit();
      }
    }, RESIZE_DEBOUNCE_MS);
  });

  function isAccountPage() {
    const data = window.ajaxify && window.ajaxify.data;
    const tpl = data && data.template && data.template.name;
    if (tpl && tpl.indexOf('account/') === 0) return true;
    return $('body').is('[class*="page-user"]');
  }

  function scheduleInit() {
    if (initRaf) {
      cancelAnimationFrame(initRaf);
      initRaf = 0;
    }

    if (window.innerWidth > MOBILE_MAX) {
      cleanupInjected();
      restoreGlobalUI();
      document.body.classList.add('pxp19-profile-disabled');
      return;
    }

    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
      document.body.classList.add('pxp19-profile-disabled');
      return;
    }

    ensureExternalCss();
    installUploadCompressionPatch();
    document.body.classList.remove('pxp19-profile-disabled');
    document.body.classList.add('pxp19-profile-booting');

    // NodeBB ajaxify 在手机 Chrome / Kiwi 下有时先触发 action:ajaxify.end，
    // 后把 .account 真实 DOM 塞进 #content。原版只等约 1 秒，慢网下会错过，
    // 所以这里改成：更宽松查找 + MutationObserver 兜底。
    let tries = 0;

    function findAccountAndTop() {
      const $account = $('.account').first();
      if (!$account.length) return null;

      let $top = $account
        .find('> .d-flex.flex-column.flex-md-row.gap-2.w-100.pb-4.mb-4.mt-2.border-bottom')
        .first();

      // Harmony 版本 / 编译后 class 可能有变化，不能只卡死一条 class。
      if (!$top.length) {
        $top = $account.find('.avatar-wrapper').first().closest('.d-flex').first();
      }
      if (!$top.length) {
        $top = $account.find('[component="avatar/picture"]').first().closest('.d-flex').first();
      }
      if (!$top.length) {
        $top = $account.children('.d-flex').filter(function () {
          return $(this).find('.avatar-wrapper,.fullname,.username').length > 0;
        }).first();
      }
      if (!$top.length) return null;
      return { $account: $account, $top: $top };
    }

    function boot(found) {
      if (pageDomObserver) {
        try { pageDomObserver.disconnect(); } catch (e) {}
        pageDomObserver = null;
      }
      initXiaohongshuProfile(found.$account, found.$top);
    }

    function attempt() {
      tries += 1;

      if (window.innerWidth > MOBILE_MAX || !isAccountPage()) {
        cleanupInjected();
        restoreGlobalUI();
        return;
      }

      const found = findAccountAndTop();
      if (found) {
        boot(found);
        return;
      }

      if (tries < MAX_INIT_RETRIES) {
        initRaf = requestAnimationFrame(attempt);
      } else {
        document.body.classList.remove('pxp19-profile-booting');
        document.body.classList.add('pxp19-profile-disabled');
      }
    }

    // DOM 还没来时主动监听，不需要用户刷新。
    if (!pageDomObserver) {
      const host = document.getElementById('content') || document.querySelector('main#panel') || document.body;
      pageDomObserver = new MutationObserver(function () {
        const found = findAccountAndTop();
        if (found && profileAssetsReady) boot(found);
      });
      pageDomObserver.observe(host, { childList: true, subtree: true });
    }

    loadProfileI18n().finally(function () {
      initRaf = requestAnimationFrame(attempt);
    });
  }

  function initXiaohongshuProfile($account, $top) {
    cleanupInjected();
    if (window.innerWidth > MOBILE_MAX) return;

    const dom = getDomCache($account, $top);
    if (!dom.$account.length || !dom.$top.length) return;

    ensureExternalCss();
    hideGlobalNavigation();
    hideOriginalElements(dom);
    buildProfileShell(dom);
    tweakContentArea(dom);
    bindGlobalEvents();
    document.body.classList.add('pxp19-profile-ready');
    document.body.classList.remove('pxp19-profile-booting', 'pxp19-profile-disabled');
  }

  function cleanupInjected() {
    observers.forEach(function (obs) {
      try {
        obs.disconnect();
      } catch (e) {}
    });
    observers = [];

    if (initRaf) {
      cancelAnimationFrame(initRaf);
      initRaf = 0;
    }

    if (pageDomObserver) {
      try { pageDomObserver.disconnect(); } catch (e) {}
      pageDomObserver = null;
    }

    $('#pxp19-profile-shell, #pxp19-profile-header, #pxp19-profile-topmenu, #pxp19-tab-nav, .pxp19-injected, #xhs-profile-shell, #xhs-profile-header, #xhs-profile-topmenu, #xhs-tab-nav, .xhs-injected').remove();

    $('.pxp19-original-top-hidden, .xhs-original-top-hidden').removeClass('pxp19-original-top-hidden xhs-original-top-hidden');
    $('.pxp19-hidden, .xhs-hidden').removeClass('pxp19-hidden xhs-hidden');
    $('.pxp19-cover-raw, .xhs-cover-raw').removeClass('pxp19-cover-raw xhs-cover-raw');
    $('.pxp19-about-card, .xhs-about-card').removeClass('pxp19-about-card xhs-about-card');
    $('.pxp19-review-original-hidden, .pxp19-notes-original-hidden').removeClass('pxp19-review-original-hidden pxp19-notes-original-hidden');
    $('.pxp19-account-layout, .xhs-account-layout').removeClass('pxp19-account-layout xhs-account-layout');

    $(document).off('.pxp19Profile');
  }

  function restoreGlobalUI() {
    $('[component="bottombar"]').show();
    $('.sidebar-left, .sidebar-right').show();
    $('main#panel').css({ 'margin-top': '', 'padding-top': '' });
    $('.layout-container').css({ 'padding-bottom': '' });
    $('body').removeClass('pxp19-profile-active pxp19-profile-ready pxp19-profile-booting xhs-profile-active xhs-profile-ready xhs-profile-booting');
    $('body').addClass('pxp19-profile-disabled');
  }

  function getDomCache($account, $top) {
    return {
      $account: $account,
      $top: $top,
      $cover: $account.find('.cover[component="account/cover"]').first(),
      $avatarWrapper: $top.find('.avatar-wrapper').first(),
      $avatarImg: $top.find('.avatar-wrapper img[component="avatar/picture"]').first(),
      $infoCol: $top.find('.d-flex.flex-column.gap-1').first(),
      $fullname: $top.find('.fullname').first(),
      $username: $top.find('.username').first(),
      $originAction: $top.find('.flex-shrink-0.d-flex.gap-1.align-self-stretch.align-self-md-start.justify-content-end').first(),
      $sidebarNav: $account.find('.flex-shrink-0.pe-2.border-end-md.text-sm.mb-3.flex-basis-md-200').first(),
      $accountContent: $account.find('.account-content').first(),
      $stats: $account.find('.account-stats').first(),
      $coverControls: $account.find('.cover .controls').first(),
      $coverUpload: $account.find('.cover .upload').first(),
      $coverResize: $account.find('.cover .resize').first(),
      $coverRemove: $account.find('.cover .remove').first(),
      $coverSave: $account.find('.cover .save').first(),
      $coverIndicator: $account.find('.cover .indicator').first(),
      $avatarChangeAnchor: $account.find('.avatar-wrapper a[component="profile/change/picture"]').first(),
      $avatarChangeWrap: $account.find('.avatar-wrapper[component="profile/change/picture"]').first(),
      $follow: $top.find('[component="account/follow"]').first(),
      $unfollow: $top.find('[component="account/unfollow"]').first(),
      $chat: $top.find('[component="account/chat"]').first(),
      $newChat: $top.find('[component="account/new-chat"]').first(),
      $flag: $account.find('[component="account/flag"]').first(),
      $alreadyFlagged: $account.find('[component="account/already-flagged"]').first(),
      $block: $account.find('[component="account/block"]').first(),
      $unblock: $account.find('[component="account/unblock"]').first(),
      $ban: $account.find('[component="account/ban"]').first(),
      $unban: $account.find('[component="account/unban"]').first(),
      $mute: $account.find('[component="account/mute"]').first(),
      $unmute: $account.find('[component="account/unmute"]').first(),
      $deleteAccount: $account.find('[component="account/delete-account"]').first(),
      $deleteContent: $account.find('[component="account/delete-content"]').first(),
      $deleteAll: $account.find('[component="account/delete-all"]').first(),
      $infoLink: $account.find('a[href$="/info"]').first(),
      $themeLink: $account.find('a[href$="/theme"]').first(),
      $settingsLink: $account.find('a[href$="/settings"]').first(),
      $editLink: $account.find('a[href$="/edit"]').first()
    };
  }

  function getViewedSlug() {
    return location.pathname.split('/').filter(Boolean)[1] || '';
  }

  function getCurrentSection() {
    return location.pathname.split('/').filter(Boolean)[2] || 'about';
  }

  function isOwnProfile() {
    const me = window.app && window.app.user;
    const slug = getViewedSlug();

    if (!me || !slug) return false;

    const current = String(slug).toLowerCase();
    const mySlug = String(me.userslug || '').toLowerCase();
    const myName = String(me.username || '').toLowerCase();

    return current === mySlug || current === myName;
  }

  function isAdminViewer() {
    const me = window.app && window.app.user;
    return !!(me && (me.isAdmin || me.isGlobalMod));
  }

  function isEditableSection() {
    const section = getCurrentSection();
    return ['edit', 'settings', 'theme', 'info'].indexOf(section) !== -1;
  }

  function getProfileData() {
    const d = window.ajaxify && window.ajaxify.data;
    if (!d) return {};
    if (d.username || d.userslug) return d;
    if (d.user && (d.user.username || d.user.userslug)) return d.user;
    return {};
  }

  function getDisplayName() {
    const u = getProfileData();
    return norm(u.fullname || u.displayname || u.username || '') ||
      norm($('.fullname').first().text()) ||
      norm($('.username').first().text()).replace(/^@/, '') ||
      getViewedSlug();
  }

  function getAvatarSrc() {
    const u = getProfileData();
    return u.picture || u.uploadedpicture || '';
  }

  function getAvatarIcon() {
    const u = getProfileData();
    return {
      text: (u['icon:text'] || u.username || '?').charAt(0).toUpperCase(),
      bg: u['icon:bgColor'] || '#795548'
    };
  }

  function getCoverUrl() {
    const u = getProfileData();
    return u['cover:url'] || '';
  }

  function getBioText() {
    const u = getProfileData();
    return stripHtml(u.aboutme || u.signature || '');
  }

  function getGenderSymbol() {
    const u = getProfileData();
    const g = norm(u.gender).toLowerCase();
    if (!g) return '';
    if (g === '男' || /^m(ale)?$/.test(g)) return '♂';
    if (g === '女' || /^f(emale)?$/.test(g)) return '♀';
    return '';
  }

  function getAge() {
    const u = getProfileData();
    if (u.age) return String(u.age);
    if (!u.birthday) return '';
    const birth = new Date(u.birthday);
    if (isNaN(birth.getTime())) return '';
    const now = new Date();
    let y = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) y -= 1;
    return y > 0 ? String(y) : '';
  }

  function getCountryText() {
    const u = getProfileData();
    return norm(u.language_flag || u.country || u.nationality || '');
  }

  function getCountryFlagEmoji() {
    const raw = getCountryText();
    if (!raw) return '';

    const pairs = [
      ['mm', '🇲🇲'], ['my', '🇲🇲'], ['缅甸', '🇲🇲'], ['myanmar', '🇲🇲'], ['burma', '🇲🇲'],
      ['cn', '🇨🇳'], ['zh', '🇨🇳'], ['中国', '🇨🇳'], ['china', '🇨🇳'],
      ['sg', '🇸🇬'], ['新加坡', '🇸🇬'], ['singapore', '🇸🇬'],
      ['th', '🇹🇭'], ['泰国', '🇹🇭'], ['thailand', '🇹🇭'],
      ['la', '🇱🇦'], ['lo', '🇱🇦'], ['老挝', '🇱🇦'], ['laos', '🇱🇦'],
      ['vn', '🇻🇳'], ['vi', '🇻🇳'], ['越南', '🇻🇳'], ['vietnam', '🇻🇳'],
      ['kh', '🇰🇭'], ['km', '🇰🇭'], ['柬埔寨', '🇰🇭'], ['cambodia', '🇰🇭'],
      ['my', '🇲🇾'], ['ms', '🇲🇾'], ['马来西亚', '🇲🇾'], ['malaysia', '🇲🇾'],
      ['ph', '🇵🇭'], ['tl', '🇵🇭'], ['菲律宾', '🇵🇭'], ['philippines', '🇵🇭'],
      ['jp', '🇯🇵'], ['ja', '🇯🇵'], ['日本', '🇯🇵'], ['japan', '🇯🇵'],
      ['kr', '🇰🇷'], ['ko', '🇰🇷'], ['韩国', '🇰🇷'], ['korea', '🇰🇷'],
      ['us', '🇺🇸'], ['usa', '🇺🇸'], ['美国', '🇺🇸'], ['united states', '🇺🇸'],
      ['gb', '🇬🇧'], ['uk', '🇬🇧'], ['英国', '🇬🇧'], ['united kingdom', '🇬🇧'],
      ['fr', '🇫🇷'], ['法国', '🇫🇷'], ['france', '🇫🇷'],
      ['de', '🇩🇪'], ['德国', '🇩🇪'], ['germany', '🇩🇪'],
      ['in', '🇮🇳'], ['印度', '🇮🇳'], ['india', '🇮🇳']
    ];

    const lower = raw.toLowerCase().replace(/[\s_-]/g, '');
    for (let i = 0; i < pairs.length; i += 1) {
      const key = String(pairs[i][0]).toLowerCase().replace(/[\s_-]/g, '');
      if (lower === key) return pairs[i][1];
    }
    for (let i = 0; i < pairs.length; i += 1) {
      const key = String(pairs[i][0]).toLowerCase().replace(/[\s_-]/g, '');
      if (key.length > 2 && lower.indexOf(key) !== -1) return pairs[i][1];
    }
    return '';
  }

  function getLanguagePairInfo() {
    const u = getProfileData();

    function parse(v) {
      if (Array.isArray(v)) return v.filter(Boolean);
      const s = String(v || '').trim();
      if (!s || s === '[]') return [];
      try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) return p.filter(Boolean);
      } catch (e) {}
      return s.split(/[\/,\u3001|]+/).map(norm).filter(Boolean);
    }

    function toCode(v) {
      const r = norm(v).toLowerCase();
      const map = {
        '中文': 'ZH', '汉语': 'ZH', '普通话': 'ZH', 'chinese': 'ZH', 'mandarin': 'ZH',
        '英语': 'EN', '英文': 'EN', 'english': 'EN',
        '缅甸语': 'MY', '缅语': 'MY', '缅文': 'MY', 'burmese': 'MY', 'myanmar': 'MY',
        '日语': 'JA', 'japanese': 'JA',
        '韩语': 'KO', 'korean': 'KO',
        '泰语': 'TH', 'thai': 'TH',
        '越南语': 'VI', 'vietnamese': 'VI',
        '法语': 'FR', 'french': 'FR',
        '德语': 'DE', 'german': 'DE',
        '西班牙语': 'ES', 'spanish': 'ES',
        '老挝语': 'LO', 'lao': 'LO',
        '高棉语': 'KM', 'khmer': 'KM',
        '马来语': 'MS', 'malay': 'MS',
        '菲律宾语': 'TL', 'tagalog': 'TL'
      };
      if (map[r]) return map[r];
      if (/^[a-z]{2,4}$/i.test(r)) return r.toUpperCase();
      return norm(v).slice(0, 3).toUpperCase();
    }

    const native = [].concat(
      parse(u.language_fluent),
      parse(u.native_language),
      parse(u.language_native)
    );

    const learn = [].concat(
      parse(u.language_learning),
      parse(u.learning_language),
      parse(u.language_target)
    );

    const nativeText = unique(native.map(toCode).filter(Boolean)).join('/');
    const learnText = unique(learn.map(toCode).filter(Boolean)).join('/');

    return {
      nativeText: nativeText,
      learnText: learnText,
      text: nativeText && learnText
        ? nativeText + ' ⇄ ' + learnText
        : (nativeText || learnText || '')
    };
  }

  function renderLanguagePairHtml(info) {
    if (!info || !info.text) return '';

    if (info.nativeText && info.learnText) {
      return (
        '<span class="pxp19-lang-part">' + esc(info.nativeText) + '</span>' +
        '<span class="pxp19-lang-arrow" aria-hidden="true">⇄</span>' +
        '<span class="pxp19-lang-part">' + esc(info.learnText) + '</span>'
      );
    }

    return '<span class="pxp19-lang-part">' + esc(info.text) + '</span>';
  }

  function pickStat(keys) {
    const u = getProfileData();
    for (let i = 0; i < keys.length; i += 1) {
      if (u[keys[i]] !== undefined && u[keys[i]] !== null) return String(u[keys[i]]);
    }
    return '0';
  }

  function getFollowingCount() {
    return pickStat(['followingCount', 'following', 'followings']);
  }

  function getFollowersCount() {
    return pickStat(['followerCount', 'followers', 'followersCount']);
  }

  function getViewsCount() {
    return pickStat(['profileviews', 'profileViews', 'views']);
  }

  function hideGlobalNavigation() {
    $('body').addClass('pxp19-profile-active');
  }

  function hideOriginalElements(dom) {
    dom.$top.addClass('pxp19-original-top-hidden');
    dom.$sidebarNav.addClass('pxp19-hidden');
    dom.$originAction.addClass('pxp19-hidden');
    dom.$cover.addClass('pxp19-cover-raw');

    const $layoutRow = dom.$sidebarNav.parent();
    if ($layoutRow.length) {
      $layoutRow.addClass('pxp19-account-layout');
    }
  }

  function buildProfileShell(dom) {
    const displayName = getDisplayName();
    const avatarSrc = getAvatarSrc();
    const icon = getAvatarIcon();
    const coverUrl = getCoverUrl();
    const bio = getBioText();
    const gender = getGenderSymbol();
    const age = getAge();
    const langInfo = getLanguagePairInfo();
    const country = getCountryText();
    const avatarFlag = getCountryFlagEmoji();
    const bioIsMyanmar = containsMyanmar(bio);
    const nameIsMyanmar = containsMyanmar(displayName);

    let avatarHtml;
    if (avatarSrc) {
      avatarHtml = '<img class="pxp19-avatar-img" src="' + esc(avatarSrc) + '" alt="' + esc(displayName) + '">';
    } else {
      avatarHtml = '<div class="pxp19-avatar-fallback" style="background:' + esc(icon.bg) + '">' + esc(icon.text) + '</div>';
    }

    let uploadAvatarHtml = '';
    if (isOwnProfile()) {
      uploadAvatarHtml =
        '<button type="button" class="pxp19-avatar-upload-btn" id="xhsAvatarUploadBtn" aria-label="' + esc(T('uploadAvatar')) + '">' +
          '<i class="fa fa-camera"></i>' +
        '</button>';
    }

    const avatarFlagHtml = avatarFlag
      ? '<span class="pxp19-avatar-flag">' + avatarFlag + '</span>'
      : '';

    let genderAgeHtml = '';
    if (gender || age) {
      const gaText = [gender, age ? age + T('ageSuffix') : ''].filter(Boolean).join(' ');
      genderAgeHtml = '<span class="pxp19-gender-tag">' + esc(gaText) + '</span>';
    }

    const langHtml = langInfo.text
      ? '<div class="pxp19-language-line' + (containsMyanmar(langInfo.text) ? ' pxp19-mm-text' : '') + '">' + renderLanguagePairHtml(langInfo) + '</div>'
      : '';

    const countryHtml = country
      ? '<div class="pxp19-country-line' + (containsMyanmar(country) ? ' pxp19-mm-text' : '') + '"><i class="fa fa-map-marker-alt"></i><span>' + esc(country) + '</span></div>'
      : '';

    const bioHtml = bio
      ? '<div class="pxp19-bio' + (bioIsMyanmar ? ' pxp19-mm-bio' : '') + '">' + esc(bio) + '</div>'
      : '';

    const headerClasses = ['pxp19-injected'];
    if (!bio) headerClasses.push('pxp19-no-bio');

    const $shell = $('<div id="pxp19-profile-shell" class="pxp19-injected"></div>');
    const $header = $(
      '<div id="pxp19-profile-header" class="' + headerClasses.join(' ') + '">' +
        '<div class="pxp19-cover"></div>' +
        '<div class="pxp19-cover-shade"></div>' +
        '<div class="pxp19-header-overlay">' +
          '<div class="pxp19-user-main">' +
            '<div class="pxp19-avatar-wrap">' +
              '<div class="pxp19-avatar-circle">' + avatarHtml + '</div>' +
              avatarFlagHtml +
              uploadAvatarHtml +
            '</div>' +
            '<div class="pxp19-user-right">' +
              '<div class="pxp19-name-row">' +
                '<span class="pxp19-display-name' + (nameIsMyanmar ? ' pxp19-mm-name' : '') + '">' + esc(displayName) + '</span>' +
                genderAgeHtml +
              '</div>' +
              langHtml +
              countryHtml +
            '</div>' +
          '</div>' +
          bioHtml +
        '</div>' +
      '</div>'
    );

    if (coverUrl && coverUrl.indexOf('cover-default') === -1) {
      $header.find('.pxp19-cover').css('background-image', 'url("' + cssUrlEscape(coverUrl) + '")');
    } else {
      $header.find('.pxp19-cover').css('background', 'linear-gradient(135deg, #ff826d 0%, #ff2442 48%, #d81b60 100%)');
    }

    dom.$top.before($shell);
    $shell.append($header);

    buildStatsRow($header);
    buildActionButtons(dom, $header);
    buildTopMenu(dom, $header);
    buildTabNav($shell);

    if (isOwnProfile()) {
      $('#xhsAvatarUploadBtn').on('click', function (e) {
        e.preventDefault();
        triggerAvatarUpload(dom);
      });
    }
  }

  function buildStatsRow($header) {
    const slug = getViewedSlug();
    const stats = [
      { num: getFollowingCount(), label: T('followingCount'), href: '/user/' + slug + '/following' },
      { num: getFollowersCount(), label: T('followers'), href: '/user/' + slug + '/followers' },
      { num: getViewsCount(), label: T('views'), href: '' }
    ];

    const $row = $('<div id="pxp19-stats-row" class="pxp19-injected"></div>');
    stats.forEach(function (s) {
      const tag = s.href ? 'a' : 'div';
      const hrefAttr = s.href ? ' href="' + s.href + '"' : '';
      $row.append(
        '<' + tag + ' class="pxp19-stat-item"' + hrefAttr + '>' +
          '<span class="pxp19-stat-num">' + esc(s.num) + '</span>' +
          '<span class="pxp19-stat-label">' + esc(s.label) + '</span>' +
        '</' + tag + '>'
      );
    });

    $header.find('.pxp19-header-overlay').append($row);
  }

  function buildActionButtons(dom, $header) {
    const own = isOwnProfile();
    const editable = isEditableSection();
    const $bar = $('<div id="pxp19-action-bar" class="pxp19-injected"></div>');

    if (own) {
      if (editable) {
        const $viewBtn = $('<a href="/user/' + getViewedSlug() + '" class="pxp19-btn pxp19-btn-outline pxp19-btn-long">' + esc(T('backHome')) + '</a>');
        $bar.append($viewBtn);
      } else {
        const $editBtn = $('<button type="button" class="pxp19-btn pxp19-btn-primary pxp19-btn-long pxp19-edit-partner-profile">' + esc(T('editProfile')) + '</button>');
        $bar.append($editBtn);
      }
    } else {
      const $followSlot = $('<div class="pxp19-btn-slot pxp19-btn-long-slot"></div>');
      mirrorFollowState($followSlot, dom.$follow, dom.$unfollow);
      $bar.append($followSlot);

      if (dom.$chat.length) {
        const $chatBtn = $('<button type="button" class="pxp19-btn pxp19-btn-outline pxp19-btn-long">' + esc(T('chat')) + '</button>');
        $chatBtn.on('click', function (e) {
          e.preventDefault();
          dom.$chat.get(0).click();
        });
        $bar.append($chatBtn);
      }
    }

    $header.find('.pxp19-header-overlay').append($bar);
  }

  function buildTopMenu(dom, $header) {
    const own = isOwnProfile();
    const admin = isAdminViewer();
    const $wrap = $('<div id="pxp19-profile-topmenu" class="pxp19-injected"></div>');
    const $menuWrap = $('<div class="pxp19-menu-wrap pxp19-topmenu-wrap"></div>');
    const $btn = $('<button type="button" class="pxp19-topmenu-btn" aria-label="' + esc(T('more')) + '"><i class="fa fa-ellipsis-h"></i></button>');
    const $menu = $('<div class="pxp19-dropdown-menu pxp19-topmenu-dropdown" id="pxp19-topmenu-dropdown"></div>');

    if (own) {
      addMenuLink($menu, '/user/' + getViewedSlug() + '/settings', 'fa-gear', T('settings'));
      addMenuLink($menu, '/user/' + getViewedSlug() + '/theme', 'fa-paint-brush', T('themeSettings'));
      addMenuDivider($menu);
      addMenuCustomAction($menu, 'fa-camera', T('uploadAvatar'), function () {
        triggerAvatarUpload(dom);
      });
      addMenuAction($menu, dom.$coverUpload, 'fa-image', T('uploadCover'));
      addMenuAction($menu, dom.$coverResize, 'fa-arrows-alt', T('resizeCover'));
      addMenuAction($menu, dom.$coverRemove, 'fa-trash', T('removeCover'));
    } else {
      if (admin) {
        addMenuLink($menu, '/user/' + getViewedSlug() + '/info', 'fa-id-card', T('accountInfo'));
        addMenuMirrorButtons($menu, dom.$mute, dom.$unmute, 'fa-volume-xmark', T('muteAccount'), T('unmuteAccount'));
        addMenuMirrorButtons($menu, dom.$ban, dom.$unban, 'fa-ban', T('banAccount'), T('unbanAccount'));
        addMenuAction($menu, dom.$deleteAccount, 'fa-trash', T('deleteAccount'));
        addMenuAction($menu, dom.$deleteContent, 'fa-eraser', T('deleteContent'));
        addMenuAction($menu, dom.$deleteAll, 'fa-bomb', T('deleteAll'));
        addMenuDivider($menu);
      }
      addMenuMirrorButtons($menu, dom.$flag, dom.$alreadyFlagged, 'fa-flag', T('reportProfile'), T('reported'));
      addMenuMirrorButtons($menu, dom.$block, dom.$unblock, 'fa-eye-slash', T('blockUser'), T('unblockUser'));
    }

    $btn.on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $('.pxp19-dropdown-menu').not($menu).removeClass('show');
      $menu.toggleClass('show');
    });

    $menuWrap.append($btn, $menu);
    $wrap.append($menuWrap);
    $header.append($wrap);
  }

  function buildTabNav($shell) {
    const slug = getViewedSlug();
    const section = getCurrentSection();
    const primaryTabs = [
      { key: 'about', label: T('review'), href: '/user/' + slug },
      { key: 'topics', label: T('notes'), href: '/user/' + slug + '/topics' }
    ];

    const $nav = $('<div id="pxp19-tab-nav" class="pxp19-injected"></div>');
    const $scroll = $('<div class="pxp19-tab-scroll"></div>');

    primaryTabs.forEach(function (tab) {
      const active = isTabActive(section, tab.key) ? ' active' : '';
      $scroll.append('<a href="' + tab.href + '" class="pxp19-tab' + active + '">' + esc(tab.label) + '</a>');
    });

    $nav.append($scroll);
    $shell.append($nav);
  }

  function isTabActive(section, key) {
    if (key === 'about' && section === 'about') return true;
    return section === key;
  }

  function mirrorFollowState($slot, $follow, $unfollow) {
    function render() {
      $slot.empty();
      const followHidden = !$follow.length || $follow.hasClass('hide') || $follow.hasClass('hidden');
      const unfollowHidden = !$unfollow.length || $unfollow.hasClass('hide') || $unfollow.hasClass('hidden');

      let $btn = null;
      if (!followHidden && $follow.length) {
        $btn = $('<button type="button" class="pxp19-btn pxp19-btn-primary pxp19-btn-long">' + esc(T('follow')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $follow.get(0).click();
        });
      } else if (!unfollowHidden && $unfollow.length) {
        $btn = $('<button type="button" class="pxp19-btn pxp19-btn-outline-muted pxp19-btn-long">' + esc(T('following')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $unfollow.get(0).click();
        });
      } else if ($follow.length) {
        $btn = $('<button type="button" class="pxp19-btn pxp19-btn-primary pxp19-btn-long">' + esc(T('follow')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $follow.get(0).click();
        });
      }

      if ($btn) $slot.append($btn);
    }

    render();

    const obs = new MutationObserver(render);
    $follow.add($unfollow).each(function () {
      obs.observe(this, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    observers.push(obs);
  }

  function addMenuLink($menu, href, icon, text) {
    $menu.append(
      '<a href="' + href + '" class="pxp19-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</a>'
    );
  }

  function addMenuCustomAction($menu, icon, text, fn) {
    const $item = $(
      '<button type="button" class="pxp19-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</button>'
    );
    $item.on('click', function (e) {
      e.preventDefault();
      $('.pxp19-dropdown-menu').removeClass('show');
      fn();
    });
    $menu.append($item);
  }

  function addMenuDivider($menu) {
    $menu.append('<div class="pxp19-menu-divider"></div>');
  }

  function addMenuAction($menu, $source, icon, text) {
    if (!$source || !$source.length) return;

    const $item = $(
      '<button type="button" class="pxp19-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</button>'
    );

    $item.on('click', function (e) {
      e.preventDefault();
      $('.pxp19-dropdown-menu').removeClass('show');
      $source.get(0).click();
    });

    $menu.append($item);
  }

  function addMenuMirrorButtons($menu, $a, $b, icon, textA, textB) {
    if ((!$a || !$a.length) && (!$b || !$b.length)) return;

    const $wrapper = $('<div class="pxp19-menu-mirror-slot"></div>');

    function render() {
      $wrapper.empty();
      const aHidden = !$a.length || $a.hasClass('hide') || $a.hasClass('hidden');
      const bHidden = !$b.length || $b.hasClass('hide') || $b.hasClass('hidden');

      let $target = null;
      let label = '';

      if (!aHidden && $a.length) {
        $target = $a;
        label = textA;
      } else if (!bHidden && $b.length) {
        $target = $b;
        label = textB;
      } else if ($a.length) {
        $target = $a;
        label = textA;
      }

      if (!$target) return;

      const $item = $(
        '<button type="button" class="pxp19-menu-item">' +
          '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(label) + '</span>' +
        '</button>'
      );

      $item.on('click', function (e) {
        e.preventDefault();
        $('.pxp19-dropdown-menu').removeClass('show');
        $target.get(0).click();
      });

      $wrapper.append($item);
    }

    render();

    const obs = new MutationObserver(render);
    $a.add($b).each(function () {
      obs.observe(this, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    observers.push(obs);

    $menu.append($wrapper);
  }

  function triggerAvatarUpload(dom) {
    const $anchor = dom.$avatarChangeAnchor;
    const $wrap = dom.$avatarChangeWrap;

    if ($anchor && $anchor.length) {
      $anchor.get(0).click();
      return;
    }
    if ($wrap && $wrap.length) {
      $wrap.get(0).click();
    }
  }

  function tweakContentArea(dom) {
    const section = getCurrentSection();
    const editable = isEditableSection();

    // 笔记页恢复 NodeBB 原生列表，不再额外渲染双列卡片，避免重复。
    if (section === 'topics') {
      dom.$accountContent.find('.pxp19-notes-grid').remove();
      dom.$accountContent.children().removeClass('pxp19-notes-original-hidden pxp19-review-original-hidden pxp19-hidden');
      return;
    }

    if (!editable) {
      dom.$accountContent.children('.d-flex.justify-content-between.align-items-center.mb-3').addClass('pxp19-hidden');
    }

    if (section === 'about') {
      renderReviewSection(dom);
      return;
    }

    dom.$stats.find('.card').addClass('pxp19-about-card');
  }



  function getViewedUid() {
    const data = getProfileData();
    const uid = data.uid || data.userId || data.userid ||
      $('[component="avatar/picture"][data-uid]').first().attr('data-uid') ||
      $('[component="avatar/icon"][data-uid]').first().attr('data-uid') ||
      $('.avatar[data-uid]').first().attr('data-uid') || '';
    return String(uid || '').trim();
  }

  function requestJson(url, options) {
    options = options || {};
    options.credentials = 'same-origin';
    options.headers = Object.assign({
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest'
    }, options.headers || {});
    return fetch(rel(url), options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        const data = json && (json.response || json.data || json);
        if (!res.ok || (data && data.ok === false)) {
          const msg = (data && (data.error || data.message || data.reason)) || json.error || json.message || ('HTTP ' + res.status);
          const err = new Error(msg);
          err.status = res.status;
          err.payload = data;
          throw err;
        }
        return data;
      });
    });
  }

  function profileAlert(message, type) {
    if (window.app && type === 'error' && typeof window.app.alertError === 'function') return app.alertError(message);
    if (window.app && typeof window.app.alertSuccess === 'function') return app.alertSuccess(message);
    window.alert(message);
  }

  function starButtons(value, interactive) {
    const n = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    let html = '';
    for (let i = 1; i <= 5; i += 1) {
      html += '<button type="button" class="pxp19-star' + (i <= n ? ' active' : '') + '" data-star="' + i + '"' + (interactive ? '' : ' tabindex="-1" aria-hidden="true"') + '>★</button>';
    }
    return html;
  }

  function normalizeReviewList(data) {
    data = data || {};
    const items = data.comments || data.reviews || data.items || [];
    const summary = data.summary || {};
    const count = Number(summary.count || data.count || items.length || 0) || 0;
    const overall = Number(summary.overall || data.overall || data.avg || 0) || 0;
    return { items: Array.isArray(items) ? items : [], count: count, overall: overall, canReview: data.canReview || {}, viewerComment: data.viewerComment || null };
  }

  function fetchReviews(uid) {
    const id = encodeURIComponent(uid || getViewedUid() || getViewedSlug());
    const endpoints = [
      '/api/peipe-partners/comments/' + id + '?limit=40',
      '/api/peipe-partners/profile/' + id + '/comments?limit=40',
      '/api/plugins/peipe-partners/comments/' + id + '?limit=40'
    ];
    let chain = Promise.reject(new Error('start'));
    endpoints.forEach(function (url) {
      chain = chain.catch(function () { return requestJson(url); });
    });
    return chain.then(normalizeReviewList);
  }

  function submitReview(uid, payload) {
    const id = encodeURIComponent(uid || getViewedUid() || getViewedSlug());
    const endpoints = [
      '/api/peipe-partners/comments/' + id,
      '/api/peipe-partners/profile/' + id + '/comments',
      '/api/plugins/peipe-partners/comments/' + id
    ];
    let chain = Promise.reject(new Error('start'));
    endpoints.forEach(function (url) {
      chain = chain.catch(function () {
        return requestJson(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-csrf-token': csrfToken()
          },
          body: JSON.stringify(payload)
        });
      });
    });
    return chain;
  }

  function renderReviewItem(item) {
    item = item || {};
    const name = item.authorName || item.username || (item.anonymous ? '匿名用户' : '用户');
    const avatar = item.authorAvatar || item.picture || '';
    const rating = Number(item.overall || item.rating || item.score || 0) || 0;
    const content = item.content || item.text || item.comment || '';
    const mine = item.mine ? '<span class="pxp19-review-mine">我的评价</span>' : '';
    return '<div class="pxp19-review-item">' +
      '<div class="pxp19-review-avatar">' + (avatar ? '<img src="' + esc(avatar) + '" alt="">' : '<span>' + esc(String(name).slice(0, 1).toUpperCase()) + '</span>') + '</div>' +
      '<div class="pxp19-review-main">' +
        '<div class="pxp19-review-head"><strong>' + esc(name) + '</strong>' + mine + '<span class="pxp19-review-mini-stars">' + starButtons(rating, false) + '</span></div>' +
        (content ? '<div class="pxp19-review-text">' + esc(content) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function renderReviewSection(dom) {
    const $content = dom.$accountContent;
    if (!$content.length) return;
    const uid = getViewedUid();
    const key = 'review:' + (uid || getViewedSlug());
    if ($content.data('pxp19ReviewKey') === key && $content.find('.pxp19-review-panel').length) return;
    $content.data('pxp19ReviewKey', key);

    $content.find('.pxp19-review-panel').remove();
    $content.children().not('.pxp19-injected').addClass('pxp19-review-original-hidden');

    const $panel = $('<section class="pxp19-review-panel pxp19-injected">' +
      '<div class="pxp19-review-summary">' +
        '<div><div class="pxp19-review-score">0.0</div><div class="pxp19-review-summary-label">' + esc(T('reviewSummary')) + '</div></div>' +
        '<div class="pxp19-review-summary-side"><div class="pxp19-review-stars">' + starButtons(0, false) + '</div><div class="pxp19-review-count">0 ' + esc(T('reviewCount')) + '</div></div>' +
      '</div>' +
      '<div class="pxp19-review-form">' +
        '<div class="pxp19-review-form-title">' + esc(T('reviewTitle')) + '</div>' +
        '<div class="pxp19-review-input-stars" data-rating="5">' + starButtons(5, true) + '</div>' +
        '<textarea class="pxp19-review-textarea" maxlength="240" placeholder="' + esc(T('reviewPlaceholder')) + '"></textarea>' +
        '<label class="pxp19-review-anon"><input type="checkbox" class="pxp19-review-anonymous"> <span>' + esc(T('reviewAnonymous')) + '</span></label>' +
        '<button type="button" class="pxp19-review-submit">' + esc(T('reviewSubmit')) + '</button>' +
        '<div class="pxp19-review-hint"></div>' +
      '</div>' +
      '<div class="pxp19-review-list"><div class="pxp19-review-empty">' + esc(T('loading')) + '</div></div>' +
    '</section>');

    $content.append($panel);

    fetchReviews(uid).then(function (data) {
      const overall = Math.max(0, Math.min(5, Number(data.overall || 0)));
      $panel.find('.pxp19-review-score').text(overall.toFixed(1));
      $panel.find('.pxp19-review-stars').html(starButtons(overall, false));
      $panel.find('.pxp19-review-count').text((data.count || 0) + ' ' + T('reviewCount'));
      if (data.canReview && data.canReview.eligible === false && data.canReview.reason === 'chat-under-24h') {
        $panel.find('.pxp19-review-hint').text(T('reviewUnder24h')).addClass('show');
      }
      const items = data.items || [];
      $panel.find('.pxp19-review-list').html(items.length ? items.map(renderReviewItem).join('') : '<div class="pxp19-review-empty">' + esc(T('reviewEmpty')) + '</div>');
    }).catch(function () {
      $panel.find('.pxp19-review-list').html('<div class="pxp19-review-empty">' + esc(T('reviewEmpty')) + '</div>');
    });
  }

  const PARTNER_OPTIONS = {
    countries: [
      { value: 'CN', label: '中国' }, { value: 'MM', label: '缅甸' }, { value: 'VN', label: '越南' }, { value: 'TH', label: '泰国' },
      { value: 'US', label: '美国' }, { value: 'GB', label: '英国' }, { value: 'JP', label: '日本' }, { value: 'KR', label: '韩国' }
    ],
    languages: [
      { value: 'CN', label: '中文' }, { value: 'EN', label: 'English' }, { value: 'MM', label: 'မြန်မာ' }, { value: 'VI', label: 'Tiếng Việt' },
      { value: 'TH', label: 'ภาษาไทย' }, { value: 'JP', label: '日本語' }, { value: 'KR', label: '한국어' }
    ],
    genders: [
      { value: 'male', label: '男' }, { value: 'female', label: '女' }, { value: 'private', label: '保密' }
    ],
    relationships: [
      { value: '', label: '请选择' }, { value: 'private', label: '保密' }, { value: 'single', label: '单身' }, { value: 'dating', label: '恋爱中' }, { value: 'married', label: '已婚' }, { value: 'divorced', label: '离异' }
    ],
    educations: [
      { value: '', label: '请选择' }, { value: 'private', label: '保密' }, { value: 'middle_school', label: '初中' }, { value: 'high_school', label: '高中' }, { value: 'college', label: '大专' }, { value: 'bachelor', label: '本科' }, { value: 'master', label: '硕士' }, { value: 'doctor', label: '博士' }
    ],
    occupations: [
      { value: '', label: '请选择' }, { value: 'student', label: '在校生' }, { value: 'worker', label: '普通职工' }, { value: 'waiter', label: '服务员' }, { value: 'teacher', label: '老师' }, { value: 'police', label: '警察' }, { value: 'driver', label: '司机' }, { value: 'sales', label: '销售' }, { value: 'developer', label: '程序员' }, { value: 'designer', label: '设计师' }, { value: 'business_owner', label: '个体/老板' }, { value: 'unemployed', label: '无业' }, { value: 'other', label: '其他' }
    ],
    tags: [
      { key: 'purpose', label: '练习目的', tags: [{ key: 'daily_chat', label: '日常聊天' }, { key: 'voice_practice', label: '语音练习' }, { key: 'text_chat', label: '文字聊天' }, { key: 'pronunciation', label: '纠音' }, { key: 'grammar', label: '语法' }, { key: 'exam', label: '考试' }, { key: 'business', label: '商务' }, { key: 'travel', label: '旅行' }] },
      { key: 'personality', label: '性格', tags: [{ key: 'patient', label: '有耐心' }, { key: 'friendly', label: '友好' }, { key: 'outgoing', label: '外向' }, { key: 'quiet', label: '安静' }, { key: 'humorous', label: '幽默' }, { key: 'serious', label: '认真' }] },
      { key: 'interests', label: '兴趣', tags: [{ key: 'movies', label: '电影' }, { key: 'music', label: '音乐' }, { key: 'games', label: '游戏' }, { key: 'sports', label: '运动' }, { key: 'food', label: '美食' }, { key: 'books', label: '阅读' }, { key: 'anime', label: '动漫' }, { key: 'technology', label: '科技' }] },
      { key: 'time', label: '时间', tags: [{ key: 'morning', label: '早上' }, { key: 'afternoon', label: '下午' }, { key: 'night', label: '晚上' }, { key: 'weekend', label: '周末' }, { key: 'daily', label: '每天' }] },
      { key: 'level', label: '水平', tags: [{ key: 'beginner', label: '初级' }, { key: 'intermediate', label: '中级' }, { key: 'advanced', label: '高级' }, { key: 'native_helper', label: '母语帮助' }] }
    ]
  };

  let partnerEditorState = { profile: null, options: null, selectedTags: [], picker: null };

  function asArray(v) {
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    const s = String(v || '').trim();
    if (!s || s === '[]') return [];
    try { const p = JSON.parse(s); if (Array.isArray(p)) return p.filter(Boolean).map(String); } catch (e) {}
    return s.split(/[，,、\s/|]+/).map(norm).filter(Boolean);
  }

  function optionLabel(list, value) {
    value = String(value || '');
    const item = (list || []).find(function (x) { return String(x.value || x.key) === value; });
    return item ? item.label : value;
  }

  function tagLabel(key) {
    key = String(key || '');
    const cats = (partnerEditorState.options && partnerEditorState.options.tags) || PARTNER_OPTIONS.tags;
    for (let i = 0; i < cats.length; i += 1) {
      const tags = cats[i].tags || [];
      for (let j = 0; j < tags.length; j += 1) {
        if (String(tags[j].key) === key) return tags[j].label;
      }
    }
    return key;
  }

  function fetchPartnerOptions() {
    return requestJson('/api/peipe-partners/swipe/tags').then(function (json) {
      const opts = Object.assign({}, PARTNER_OPTIONS);
      if (Array.isArray(json.countries)) opts.countries = json.countries;
      if (Array.isArray(json.languages)) opts.languages = json.languages;
      if (Array.isArray(json.relationships)) opts.relationships = json.relationships;
      if (Array.isArray(json.educations)) opts.educations = json.educations;
      if (Array.isArray(json.occupations)) opts.occupations = json.occupations;
      if (Array.isArray(json.tags)) opts.tags = json.tags;
      return opts;
    }).catch(function () { return PARTNER_OPTIONS; });
  }

  function fetchMyPartnerProfile() {
    return requestJson('/api/peipe-partners/swipe/me').catch(function () {
      return {
        displayName: getDisplayName(),
        bio: getBioText(),
        language_flag: getCountryText(),
        language_fluent: asArray(getProfileData().language_fluent || getProfileData().native_language),
        language_learning: asArray(getProfileData().language_learning || getProfileData().learning_language),
        gender: getProfileData().gender || 'private',
        birthday: getProfileData().birthday || '',
        heightCm: getProfileData().heightCm || '',
        weightKg: getProfileData().weightKg || '',
        education: getProfileData().education || '',
        occupation: getProfileData().occupation || '',
        relationship: getProfileData().relationship || '',
        tags: asArray(getProfileData().tags)
      };
    });
  }

  function choiceSummary(name, value) {
    const opts = partnerEditorState.options || PARTNER_OPTIONS;
    const map = { language_flag: opts.countries, gender: opts.genders, education: opts.educations, occupation: opts.occupations, relationship: opts.relationships, language_fluent: opts.languages, language_learning: opts.languages };
    const list = map[name] || [];
    const arr = name === 'language_fluent' || name === 'language_learning' ? asArray(value) : [String(value || '')];
    const labels = arr.filter(Boolean).map(function (v) { return optionLabel(list, v); }).filter(Boolean);
    return labels.length ? labels.join(' / ') : T('chooseOption');
  }

  function choiceButton(name, label, value, multi, max) {
    const raw = multi ? asArray(value).join(',') : String(value || '');
    return '<button type="button" class="pxp19-choice-button" data-name="' + esc(name) + '" data-multi="' + (multi ? '1' : '0') + '" data-max="' + (max || 1) + '" data-value="' + esc(raw) + '"><span>' + esc(label) + '</span><b>' + esc(choiceSummary(name, value)) + '</b></button>';
  }

  function renderMiniTags(tags) {
    tags = Array.isArray(tags) ? tags : [];
    if (!tags.length) return '<span class="pxp19-editor-note">' + esc(T('chooseTags')) + '</span>';
    return tags.map(function (key) { return '<span class="pxp19-editor-tag">' + esc(tagLabel(key)) + '</span>'; }).join('');
  }

  function openPartnerProfileEditor() {
    if (window.PEIPE_PARTNER_PROFILE && typeof window.PEIPE_PARTNER_PROFILE.openEditor === 'function') {
      window.PEIPE_PARTNER_PROFILE.openEditor();
      return;
    }
    if (window.PEIPE_PARTNER_PROFILE && typeof window.PEIPE_PARTNER_PROFILE.openProfile === 'function') {
      window.PEIPE_PARTNER_PROFILE.openProfile(false);
      return;
    }

    if (!$('#pxp19-partner-editor').length) {
      $('body').append('<div id="pxp19-editor-mask"></div><section id="pxp19-partner-editor" role="dialog" aria-modal="true"><div class="pxp19-editor-scroll"></div><div class="pxp19-editor-bottom"><button type="button" class="pxp19-editor-leave">' + esc(T('leave')) + '</button><button type="button" class="pxp19-editor-save">' + esc(T('save')) + '</button></div></section><div id="pxp19-choice-mask"></div><section id="pxp19-choice-sheet"><div class="pxp19-choice-head"><b></b><button type="button" class="pxp19-choice-done">' + esc(T('doneOption')) + '</button></div><div class="pxp19-choice-list"></div></section>');
    }
    $('#pxp19-editor-mask, #pxp19-partner-editor').addClass('show');
    $('#pxp19-partner-editor .pxp19-editor-scroll').html('<div class="pxp19-editor-loading">' + esc(T('loading')) + '</div>');

    Promise.all([fetchPartnerOptions(), fetchMyPartnerProfile()]).then(function (parts) {
      partnerEditorState.options = parts[0] || PARTNER_OPTIONS;
      partnerEditorState.profile = parts[1] || {};
      partnerEditorState.selectedTags = asArray(partnerEditorState.profile.tags).slice(0, 12);
      renderPartnerEditorForm();
    }).catch(function () {
      partnerEditorState.options = PARTNER_OPTIONS;
      partnerEditorState.profile = {};
      partnerEditorState.selectedTags = [];
      renderPartnerEditorForm();
    });
  }

  function renderPartnerEditorForm() {
    const p = partnerEditorState.profile || {};
    const html = '<div class="pxp19-editor-title">' + esc(T('partnerProfileTitle')) + '</div>' +
      '<div class="pxp19-editor-subtitle">' + esc(T('profileSubtitle')) + '</div>' +
      '<form class="pxp19-editor-form">' +
        '<label class="pxp19-editor-field pxp19-editor-wide"><span>' + esc(T('displayName')) + '</span><input name="displayName" value="' + esc(p.displayName || p.username || p.name || '') + '"></label>' +
        '<label class="pxp19-editor-field pxp19-editor-wide"><span>' + esc(T('bio')) + '</span><textarea name="bio" rows="3" placeholder="' + esc(T('bioPlaceholder')) + '">' + esc(p.bio || p.aboutme || p.intro || '') + '</textarea></label>' +
        '<div class="pxp19-editor-field">' + choiceButton('language_flag', T('country'), p.language_flag || p.country || p.nationality, false, 1) + '</div>' +
        '<div class="pxp19-editor-field">' + choiceButton('gender', T('gender'), p.gender || 'private', false, 1) + '</div>' +
        '<div class="pxp19-editor-field pxp19-editor-wide">' + choiceButton('language_fluent', T('nativeLanguage'), p.language_fluent || p.nativeLanguages || p.native_language, true, 5) + '</div>' +
        '<div class="pxp19-editor-field pxp19-editor-wide">' + choiceButton('language_learning', T('learningLanguage'), p.language_learning || p.learningLanguages || p.learning_language, true, 5) + '</div>' +
        '<label class="pxp19-editor-field"><span>' + esc(T('birthday')) + '</span><input type="date" name="birthday" value="' + esc(String(p.birthday || '').slice(0, 10)) + '"></label>' +
        '<label class="pxp19-editor-field"><span>' + esc(T('height')) + ' <em>cm</em></span><input inputmode="decimal" name="heightCm" value="' + esc(p.heightCm || p.height_cm || '') + '" placeholder="170"></label>' +
        '<label class="pxp19-editor-field"><span>' + esc(T('weight')) + ' <em>kg</em></span><input inputmode="decimal" name="weightKg" value="' + esc(p.weightKg || p.weight_kg || '') + '" placeholder="60"></label>' +
        '<div class="pxp19-editor-field">' + choiceButton('education', T('education') + ' ' + T('optional'), p.education, false, 1) + '</div>' +
        '<div class="pxp19-editor-field">' + choiceButton('relationship', T('relationship') + ' ' + T('optional'), p.relationship || p.relationshipStatus, false, 1) + '</div>' +
        '<div class="pxp19-editor-field pxp19-editor-wide">' + choiceButton('occupation', T('occupation') + ' ' + T('optional'), p.occupation, false, 1) + '</div>' +
        '<div class="pxp19-editor-field pxp19-editor-wide"><div class="pxp19-editor-tags-title">' + esc(T('tags')) + '</div><div class="pxp19-editor-tags-selected">' + renderMiniTags(partnerEditorState.selectedTags) + '</div><button type="button" class="pxp19-tag-picker-btn">' + esc(T('chooseTags')) + '</button></div>' +
      '</form>';
    $('#pxp19-partner-editor .pxp19-editor-scroll').html(html);
  }

  function openChoicePicker($button) {
    const name = $button.attr('data-name');
    const multi = $button.attr('data-multi') === '1';
    const max = Number($button.attr('data-max') || 1);
    const opts = partnerEditorState.options || PARTNER_OPTIONS;
    const map = { language_flag: opts.countries, gender: opts.genders, education: opts.educations, occupation: opts.occupations, relationship: opts.relationships, language_fluent: opts.languages, language_learning: opts.languages };
    const list = map[name] || [];
    let selected = multi ? asArray($button.attr('data-value')) : [String($button.attr('data-value') || '')];
    partnerEditorState.picker = { $button: $button, name: name, multi: multi, max: max, selected: selected };
    $('#pxp19-choice-sheet .pxp19-choice-head b').text($button.find('span').text());
    $('#pxp19-choice-sheet .pxp19-choice-list').html(list.map(function (item) {
      const val = String(item.value || item.key || '');
      const active = selected.indexOf(val) !== -1 ? ' active' : '';
      return '<button type="button" class="pxp19-choice-option' + active + '" data-value="' + esc(val) + '"><i>' + esc(countryFlag(item.value) || '') + '</i><span>' + esc(item.label || val) + '</span></button>';
    }).join(''));
    $('#pxp19-choice-mask, #pxp19-choice-sheet').addClass('show');
  }

  function countryFlag(code) {
    const raw = String(code || '').toLowerCase().replace(/[\s_-]/g, '');
    const map = { cn: '🇨🇳', zh: '🇨🇳', mm: '🇲🇲', my: '🇲🇲', vn: '🇻🇳', vi: '🇻🇳', th: '🇹🇭', us: '🇺🇸', gb: '🇬🇧', uk: '🇬🇧', jp: '🇯🇵', ja: '🇯🇵', kr: '🇰🇷', ko: '🇰🇷', sg: '🇸🇬', kh: '🇰🇭', km: '🇰🇭', la: '🇱🇦', lo: '🇱🇦', ph: '🇵🇭', tl: '🇵🇭', fr: '🇫🇷', de: '🇩🇪', in: '🇮🇳' };
    return map[raw] || '';
  }

  function closeChoicePicker(apply) {
    const picker = partnerEditorState.picker;
    if (apply && picker && picker.$button) {
      const value = picker.multi ? picker.selected.join(',') : (picker.selected[0] || '');
      picker.$button.attr('data-value', value);
      picker.$button.find('b').text(choiceSummary(picker.name, picker.multi ? picker.selected : value));
    }
    partnerEditorState.picker = null;
    $('#pxp19-choice-mask, #pxp19-choice-sheet').removeClass('show');
  }

  function openTagPicker() {
    const opts = partnerEditorState.options || PARTNER_OPTIONS;
    const cats = opts.tags || PARTNER_OPTIONS.tags;
    partnerEditorState.picker = { tagMode: true, selected: partnerEditorState.selectedTags.slice(0, 12) };
    $('#pxp19-choice-sheet .pxp19-choice-head b').text(T('tags'));
    $('#pxp19-choice-sheet .pxp19-choice-list').html(cats.map(function (cat) {
      const tags = cat.tags || [];
      return '<div class="pxp19-tag-category"><div class="pxp19-tag-category-title">' + esc(cat.label || '') + '</div><div class="pxp19-tag-grid">' + tags.map(function (tag) {
        const key = String(tag.key || '');
        const active = partnerEditorState.picker.selected.indexOf(key) !== -1 ? ' active' : '';
        return '<button type="button" class="pxp19-tag-option' + active + '" data-key="' + esc(key) + '">' + esc(tag.label || key) + '</button>';
      }).join('') + '</div></div>';
    }).join(''));
    $('#pxp19-choice-mask, #pxp19-choice-sheet').addClass('show');
  }

  function savePartnerProfileFromEditor() {
    const $form = $('#pxp19-partner-editor .pxp19-editor-form');
    if (!$form.length) return;
    const data = {};
    $form.serializeArray().forEach(function (item) { data[item.name] = norm(item.value); });
    $form.find('.pxp19-choice-button').each(function () {
      const $btn = $(this);
      const name = $btn.attr('data-name');
      const multi = $btn.attr('data-multi') === '1';
      const value = $btn.attr('data-value') || '';
      data[name] = multi ? asArray(value).slice(0, Number($btn.attr('data-max') || 5)) : value;
    });
    data.tags = partnerEditorState.selectedTags.slice(0, 12);

    const missing = [];
    if (!data.displayName) missing.push(T('displayName'));
    if (!data.language_flag) missing.push(T('country'));
    if (!asArray(data.language_fluent).length) missing.push(T('nativeLanguage'));
    if (!asArray(data.language_learning).length) missing.push(T('learningLanguage'));
    if (!data.gender) data.gender = 'private';
    if (!data.birthday) missing.push(T('birthday'));
    if (missing.length) return profileAlert(T('missingPrefix') + missing.join('、'), 'error');

    const $btn = $('.pxp19-editor-save').prop('disabled', true).text(T('saving'));
    requestJson('/api/peipe-partners/swipe/me', {
      method: 'PUT',
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(data)
    }).then(function () {
      $('#pxp19-editor-mask, #pxp19-partner-editor').removeClass('show');
      profileAlert(T('saveOk'));
      if (window.ajaxify && typeof ajaxify.refresh === 'function') ajaxify.refresh();
      else location.reload();
    }).catch(function (err) {
      profileAlert((err && err.message) || T('saveFail'), 'error');
    }).finally(function () {
      $btn.prop('disabled', false).text(T('save'));
    });
  }

  function renderNotesSection(dom) {
    if (getCurrentSection() !== 'topics') return;
    const $content = dom.$accountContent;
    if (!$content.length || $content.find('.pxp19-notes-grid').length) return;

    const notes = collectNotesFromDom($content);
    $content.children().not('.pxp19-injected').addClass('pxp19-notes-original-hidden');

    const $grid = $('<div class="pxp19-notes-grid pxp19-injected" aria-live="polite"></div>');
    $content.append($grid);

    if (notes.length) {
      renderNotes($grid, notes);
      return;
    }

    $grid.html('<div class="pxp19-notes-empty">' + esc(T('notesLoading')) + '</div>');
    fetchNotesFromApi().then(function (apiNotes) {
      if (apiNotes && apiNotes.length) renderNotes($grid, apiNotes);
      else $grid.html('<div class="pxp19-notes-empty">' + esc(T('notesEmpty')) + '</div>');
    }).catch(function () {
      $grid.html('<div class="pxp19-notes-empty">' + esc(T('notesEmpty')) + '</div>');
    });
  }

  function collectNotesFromDom($content) {
    const seen = {};
    const notes = [];

    $content.find('a[href*="/topic/"]').each(function () {
      const $a = $(this);
      const href = $a.attr('href') || '';
      if (!href || seen[href]) return;
      let title = norm($a.text());
      if (!title || title.length < 2) return;

      const $row = $a.closest('li, [component="category/topic"], [component="topic"], .topic-row, .category-item, .card, .row');
      let excerpt = '';
      if ($row.length) {
        excerpt = norm($row.find('.teaser-content, .topic-teaser, .description, [component="post/content"], .content').first().text());
        if (!excerpt) {
          const rowText = norm($row.text());
          excerpt = rowText.replace(title, '').replace(/\d+\s*(回复|浏览|views|posts)/ig, '').trim();
        }
      }

      let image = '';
      $row.find('img').each(function () {
        const src = $(this).attr('src') || $(this).attr('data-src') || '';
        const cls = String($(this).attr('class') || '');
        if (!src || /avatar|user|emoji|icon/i.test(cls + ' ' + src)) return;
        image = src;
        return false;
      });

      seen[href] = true;
      notes.push({ href: href, title: title, excerpt: excerpt, image: image });
    });

    return notes.slice(0, 60);
  }

  function fetchNotesFromApi() {
    const slug = getViewedSlug();
    if (!slug) return Promise.resolve([]);
    return fetch(rel('/api/user/' + encodeURIComponent(slug) + '/topics'), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('topics ' + res.status);
      return res.json();
    }).then(function (json) {
      const data = json && (json.topics || json.posts || json.response && (json.response.topics || json.response.posts) || []);
      return normalizeApiNotes(Array.isArray(data) ? data : []);
    });
  }

  function normalizeApiNotes(items) {
    return items.map(function (item) {
      item = item || {};
      const tid = item.tid || item.topicId || item.slug || '';
      const slug = item.slug || (tid ? String(tid) : '');
      const href = item.href || item.url || (slug ? '/topic/' + slug : '');
      const title = norm(item.title || item.topicTitle || item.name || '');
      const excerpt = stripHtml(item.teaser && (item.teaser.content || item.teaser.text) || item.content || item.excerpt || item.description || '');
      let image = item.image || item.cover || item.thumbnail || '';
      if (!image && item.teaser && item.teaser.image) image = item.teaser.image;
      if (!title || !href) return null;
      return { href: href, title: title, excerpt: norm(excerpt), image: image };
    }).filter(Boolean).slice(0, 60);
  }

  function renderNotes($grid, notes) {
    $grid.empty();
    notes.forEach(function (note) {
      const imageHtml = note.image
        ? '<div class="pxp19-note-cover" style="background-image:url(&quot;' + esc(note.image) + '&quot;)"></div>'
        : '<div class="pxp19-note-cover pxp19-note-cover-empty"></div>';
      const excerptHtml = note.excerpt
        ? '<div class="pxp19-note-excerpt">' + esc(note.excerpt).slice(0, 90) + '</div>'
        : '';
      $grid.append(
        '<a class="pxp19-note-card" href="' + esc(note.href) + '" aria-label="' + esc(T('noteOpen')) + '">' +
          imageHtml +
          '<div class="pxp19-note-body">' +
            '<div class="pxp19-note-title">' + esc(note.title) + '</div>' +
            excerptHtml +
          '</div>' +
        '</a>'
      );
    });
  }

  function bindGlobalEvents() {
    $(document).off('.pxp19Profile');
    $(document).on('click.pxp19Profile', function (e) {
      if (!$(e.target).closest('.pxp19-menu-wrap').length) {
        $('.pxp19-dropdown-menu').removeClass('show');
      }
    });

    $(document).on('click.pxp19Profile', '.pxp19-edit-partner-profile', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPartnerProfileEditor();
    });

    $(document).on('click.pxp19Profile', '.pxp19-review-input-stars .pxp19-star', function () {
      const val = Number($(this).attr('data-star') || 5);
      const $wrap = $(this).closest('.pxp19-review-input-stars').attr('data-rating', val);
      $wrap.find('.pxp19-star').each(function () {
        $(this).toggleClass('active', Number($(this).attr('data-star')) <= val);
      });
    });

    $(document).on('click.pxp19Profile', '.pxp19-review-submit', function () {
      const me = window.app && window.app.user;
      if (!me || !me.uid) return profileAlert(T('reviewLogin'), 'error');
      const $btn = $(this);
      const $form = $btn.closest('.pxp19-review-form');
      const rating = Number($form.find('.pxp19-review-input-stars').attr('data-rating') || 5);
      const content = norm($form.find('.pxp19-review-textarea').val());
      if (content.length < 2) return profileAlert(T('reviewPlaceholder'), 'error');
      const payload = {
        content: content,
        anonymous: !!$form.find('.pxp19-review-anonymous').prop('checked'),
        ratings: { language: rating, reply: rating, friendly: rating, patient: rating }
      };
      $btn.prop('disabled', true).text(T('reviewSaving'));
      submitReview(getViewedUid(), payload).then(function () {
        $('.account-content').removeData('pxp19ReviewKey');
        const dom = getDomCache($('.account').first(), $('.account').first().find('.avatar-wrapper').first().closest('.d-flex').first());
        renderReviewSection(dom);
        profileAlert(T('reviewSaved'));
      }).catch(function (err) {
        profileAlert((err && err.message === 'chat-under-24h') ? T('reviewUnder24h') : T('reviewFail'), 'error');
      }).finally(function () {
        $btn.prop('disabled', false).text(T('reviewSubmit'));
      });
    });

    $(document).on('click.pxp19Profile', '#pxp19-editor-mask, .pxp19-editor-leave', function () {
      $('#pxp19-editor-mask, #pxp19-partner-editor').removeClass('show');
    });

    $(document).on('click.pxp19Profile', '.pxp19-editor-save', savePartnerProfileFromEditor);

    $(document).on('click.pxp19Profile', '.pxp19-choice-button', function () {
      openChoicePicker($(this));
    });

    $(document).on('click.pxp19Profile', '.pxp19-tag-picker-btn', openTagPicker);

    $(document).on('click.pxp19Profile', '#pxp19-choice-mask', function () { closeChoicePicker(false); });

    $(document).on('click.pxp19Profile', '.pxp19-choice-done', function () {
      if (partnerEditorState.picker && partnerEditorState.picker.tagMode) {
        partnerEditorState.selectedTags = partnerEditorState.picker.selected.slice(0, 12);
        $('.pxp19-editor-tags-selected').html(renderMiniTags(partnerEditorState.selectedTags));
        closeChoicePicker(false);
      } else {
        closeChoicePicker(true);
      }
    });

    $(document).on('click.pxp19Profile', '.pxp19-choice-option', function () {
      const picker = partnerEditorState.picker;
      if (!picker) return;
      const val = String($(this).attr('data-value') || '');
      if (picker.multi) {
        const idx = picker.selected.indexOf(val);
        if (idx === -1) {
          if (picker.selected.length >= picker.max) picker.selected.shift();
          picker.selected.push(val);
        } else {
          picker.selected.splice(idx, 1);
        }
        $(this).toggleClass('active', picker.selected.indexOf(val) !== -1);
      } else {
        picker.selected = [val];
        $(this).addClass('active').siblings().removeClass('active');
        closeChoicePicker(true);
      }
    });

    $(document).on('click.pxp19Profile', '.pxp19-tag-option', function () {
      const picker = partnerEditorState.picker;
      if (!picker || !picker.tagMode) return;
      const key = String($(this).attr('data-key') || '');
      const idx = picker.selected.indexOf(key);
      if (idx === -1) {
        if (picker.selected.length >= 12) picker.selected.shift();
        picker.selected.push(key);
      } else {
        picker.selected.splice(idx, 1);
      }
      $(this).toggleClass('active', picker.selected.indexOf(key) !== -1);
    });
  }

  function norm(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(str) {
    return String(str || '').replace(/<[^>]*>/g, '').trim();
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function containsMyanmar(str) {
    return /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/.test(String(str || ''));
  }

  function cssUrlEscape(url) {
    return String(url || '').replace(/[\\"\n\r\f]/g, '\\$&');
  }
})();
