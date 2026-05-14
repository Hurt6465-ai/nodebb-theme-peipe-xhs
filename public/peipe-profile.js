// URL.canParse 个人主页polyfill for older browsers
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
    i18nBaseUrl: '/plugins/nodebb-theme-peipe-xhs/peipe-profile/i18n/',
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
  }, window.PEIPE_PROFILE_CONFIG || {});

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
    noteOpen: '打开笔记'
  };

  let profileText = Object.assign({}, DEFAULT_PROFILE_TEXT, window.PEIPE_PROFILE_TEXT || {});
  let profileI18nPromise = null;
  let profileAssetsReady = false;
  let uploadCompressionInstalled = false;

  // Start hiding early when this script loads on a mobile user page.
  if (window.innerWidth <= MOBILE_MAX && /^\/user\//.test(location.pathname || '')) {
    document.body.classList.remove('xhs-profile-disabled');
    document.body.classList.add('xhs-profile-booting');
  }

  function ensureExternalCss() {
    // CSS is compiled by plugin.json -> scss/peipe-profile.scss. Do not inject a second CSS link.
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
      profileText = Object.assign({}, DEFAULT_PROFILE_TEXT, window.PEIPE_PROFILE_TEXT || {}, json || {});
      profileAssetsReady = true;
      return profileText;
    }).catch(function (err) {
      console.warn('[peipe-profile] i18n load failed, using built-in zh-CN fallback', err);
      profileText = Object.assign({}, DEFAULT_PROFILE_TEXT, window.PEIPE_PROFILE_TEXT || {});
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

  function toastProfile(text) {
    try {
      const body = document.body;
      body.classList.add('xhs-profile-uploading');
      body.setAttribute('data-xhs-uploading-text', text || T('uploading'));
      clearTimeout(body._xhsUploadToastTimer);
      body._xhsUploadToastTimer = setTimeout(function () {
        body.classList.remove('xhs-profile-uploading');
        body.removeAttribute('data-xhs-uploading-text');
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
      console.warn('[peipe-profile] image compression skipped', err);
      return file;
    });
  }

  function shouldUseAvatarConfig(url) {
    const s = String(url || '').toLowerCase();
    return /avatar|picture|profile|user/.test(s);
  }

  function cloneAndCompressFormData(fd, url) {
    if (!fd || fd.__xhsProfileCompressed) return Promise.resolve(fd);
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
      try { Object.defineProperty(next, '__xhsProfileCompressed', { value: true }); } catch (e) { next.__xhsProfileCompressed = true; }
      return next;
    });
  }

  function installUploadCompressionPatch() {
    if (uploadCompressionInstalled) return;
    uploadCompressionInstalled = true;

    if (window.fetch && !window.fetch.__xhsProfileCompressionPatched) {
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
      patchedFetch.__xhsProfileCompressionPatched = true;
      window.fetch = patchedFetch;
    }

    if (window.XMLHttpRequest && !window.XMLHttpRequest.prototype.__xhsProfileCompressionPatched) {
      const rawOpen = window.XMLHttpRequest.prototype.open;
      const rawSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        this.__xhsProfileUploadUrl = url;
        return rawOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function (body) {
        if (body instanceof FormData && !body.__xhsProfileCompressed) {
          const xhr = this;
          toastProfile(T('compressing'));
          cloneAndCompressFormData(body, xhr.__xhsProfileUploadUrl || '').then(function (nextBody) {
            toastProfile(T('uploading'));
            rawSend.call(xhr, nextBody);
          }).catch(function () {
            rawSend.call(xhr, body);
          });
          return;
        }
        return rawSend.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.__xhsProfileCompressionPatched = true;
    }
  }

  $(window).on('action:ajaxify.end', function () {
    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
      document.body.classList.add('xhs-profile-disabled');
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
      document.body.classList.add('xhs-profile-disabled');
      return;
    }

    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
      document.body.classList.add('xhs-profile-disabled');
      return;
    }

    ensureExternalCss();
    installUploadCompressionPatch();
    document.body.classList.remove('xhs-profile-disabled');
    document.body.classList.add('xhs-profile-booting');

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
        document.body.classList.remove('xhs-profile-booting');
        document.body.classList.add('xhs-profile-disabled');
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
    document.body.classList.add('xhs-profile-ready');
    document.body.classList.remove('xhs-profile-booting', 'xhs-profile-disabled');
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

    $('#xhs-profile-shell, #xhs-profile-header, #xhs-profile-topmenu, #xhs-tab-nav, .xhs-injected').remove();

    $('.xhs-original-top-hidden').removeClass('xhs-original-top-hidden');
    $('.xhs-hidden').removeClass('xhs-hidden');
    $('.xhs-cover-raw').removeClass('xhs-cover-raw');
    $('.xhs-about-card').removeClass('xhs-about-card');
    $('.xhs-account-layout').removeClass('xhs-account-layout');

    $(document).off('.xhsProfile');
  }

  function restoreGlobalUI() {
    $('[component="bottombar"]').show();
    $('.sidebar-left, .sidebar-right').show();
    $('main#panel').css({ 'margin-top': '', 'padding-top': '' });
    $('.layout-container').css({ 'padding-bottom': '' });
    $('body').removeClass('xhs-profile-active xhs-profile-ready xhs-profile-booting');
    $('body').addClass('xhs-profile-disabled');
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
      ['缅甸', '🇲🇲'], ['myanmar', '🇲🇲'], ['burma', '🇲🇲'],
      ['中国', '🇨🇳'], ['china', '🇨🇳'],
      ['新加坡', '🇸🇬'], ['singapore', '🇸🇬'],
      ['泰国', '🇹🇭'], ['thailand', '🇹🇭'],
      ['老挝', '🇱🇦'], ['laos', '🇱🇦'],
      ['越南', '🇻🇳'], ['vietnam', '🇻🇳'],
      ['柬埔寨', '🇰🇭'], ['cambodia', '🇰🇭'],
      ['马来西亚', '🇲🇾'], ['malaysia', '🇲🇾'],
      ['菲律宾', '🇵🇭'], ['philippines', '🇵🇭'],
      ['日本', '🇯🇵'], ['japan', '🇯🇵'],
      ['韩国', '🇰🇷'], ['korea', '🇰🇷'],
      ['美国', '🇺🇸'], ['usa', '🇺🇸'], ['united states', '🇺🇸'],
      ['英国', '🇬🇧'], ['uk', '🇬🇧'], ['united kingdom', '🇬🇧'],
      ['法国', '🇫🇷'], ['france', '🇫🇷'],
      ['德国', '🇩🇪'], ['germany', '🇩🇪'],
      ['印度', '🇮🇳'], ['india', '🇮🇳']
    ];

    const lower = raw.toLowerCase();
    for (let i = 0; i < pairs.length; i += 1) {
      if (lower.indexOf(pairs[i][0]) !== -1) return pairs[i][1];
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
        '<span class="xhs-lang-part">' + esc(info.nativeText) + '</span>' +
        '<span class="xhs-lang-arrow" aria-hidden="true">⇄</span>' +
        '<span class="xhs-lang-part">' + esc(info.learnText) + '</span>'
      );
    }

    return '<span class="xhs-lang-part">' + esc(info.text) + '</span>';
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
    $('body').addClass('xhs-profile-active');
  }

  function hideOriginalElements(dom) {
    dom.$top.addClass('xhs-original-top-hidden');
    dom.$sidebarNav.addClass('xhs-hidden');
    dom.$originAction.addClass('xhs-hidden');
    dom.$cover.addClass('xhs-cover-raw');

    const $layoutRow = dom.$sidebarNav.parent();
    if ($layoutRow.length) {
      $layoutRow.addClass('xhs-account-layout');
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
      avatarHtml = '<img class="xhs-avatar-img" src="' + esc(avatarSrc) + '" alt="' + esc(displayName) + '">';
    } else {
      avatarHtml = '<div class="xhs-avatar-fallback" style="background:' + esc(icon.bg) + '">' + esc(icon.text) + '</div>';
    }

    let uploadAvatarHtml = '';
    if (isOwnProfile()) {
      uploadAvatarHtml =
        '<button type="button" class="xhs-avatar-upload-btn" id="xhsAvatarUploadBtn" aria-label="' + esc(T('uploadAvatar')) + '">' +
          '<i class="fa fa-camera"></i>' +
        '</button>';
    }

    const avatarFlagHtml = avatarFlag
      ? '<span class="xhs-avatar-flag">' + avatarFlag + '</span>'
      : '';

    let genderAgeHtml = '';
    if (gender || age) {
      const gaText = [gender, age ? age + T('ageSuffix') : ''].filter(Boolean).join(' ');
      genderAgeHtml = '<span class="xhs-gender-tag">' + esc(gaText) + '</span>';
    }

    const langHtml = langInfo.text
      ? '<div class="xhs-language-line' + (containsMyanmar(langInfo.text) ? ' xhs-mm-text' : '') + '">' + renderLanguagePairHtml(langInfo) + '</div>'
      : '';

    const countryHtml = country
      ? '<div class="xhs-country-line' + (containsMyanmar(country) ? ' xhs-mm-text' : '') + '"><i class="fa fa-map-marker-alt"></i><span>' + esc(country) + '</span></div>'
      : '';

    const bioHtml = bio
      ? '<div class="xhs-bio' + (bioIsMyanmar ? ' xhs-mm-bio' : '') + '">' + esc(bio) + '</div>'
      : '';

    const headerClasses = ['xhs-injected'];
    if (!bio) headerClasses.push('xhs-no-bio');

    const $shell = $('<div id="xhs-profile-shell" class="xhs-injected"></div>');
    const $header = $(
      '<div id="xhs-profile-header" class="' + headerClasses.join(' ') + '">' +
        '<div class="xhs-cover"></div>' +
        '<div class="xhs-cover-shade"></div>' +
        '<div class="xhs-header-overlay">' +
          '<div class="xhs-user-main">' +
            '<div class="xhs-avatar-wrap">' +
              '<div class="xhs-avatar-circle">' + avatarHtml + '</div>' +
              avatarFlagHtml +
              uploadAvatarHtml +
            '</div>' +
            '<div class="xhs-user-right">' +
              '<div class="xhs-name-row">' +
                '<span class="xhs-display-name' + (nameIsMyanmar ? ' xhs-mm-name' : '') + '">' + esc(displayName) + '</span>' +
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
      $header.find('.xhs-cover').css('background-image', 'url("' + cssUrlEscape(coverUrl) + '")');
    } else {
      $header.find('.xhs-cover').css('background', 'linear-gradient(135deg, #ff826d 0%, #ff2442 48%, #d81b60 100%)');
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

    const $row = $('<div id="xhs-stats-row" class="xhs-injected"></div>');
    stats.forEach(function (s) {
      const tag = s.href ? 'a' : 'div';
      const hrefAttr = s.href ? ' href="' + s.href + '"' : '';
      $row.append(
        '<' + tag + ' class="xhs-stat-item"' + hrefAttr + '>' +
          '<span class="xhs-stat-num">' + esc(s.num) + '</span>' +
          '<span class="xhs-stat-label">' + esc(s.label) + '</span>' +
        '</' + tag + '>'
      );
    });

    $header.find('.xhs-header-overlay').append($row);
  }

  function buildActionButtons(dom, $header) {
    const own = isOwnProfile();
    const editable = isEditableSection();
    const $bar = $('<div id="xhs-action-bar" class="xhs-injected"></div>');

    if (own) {
      if (editable) {
        const $viewBtn = $('<a href="/user/' + getViewedSlug() + '" class="xhs-btn xhs-btn-outline xhs-btn-long">' + esc(T('backHome')) + '</a>');
        $bar.append($viewBtn);
      } else {
        const $editBtn = $('<a href="/user/' + getViewedSlug() + '/edit" class="xhs-btn xhs-btn-primary xhs-btn-long">' + esc(T('editProfile')) + '</a>');
        $bar.append($editBtn);
      }
    } else {
      const $followSlot = $('<div class="xhs-btn-slot xhs-btn-long-slot"></div>');
      mirrorFollowState($followSlot, dom.$follow, dom.$unfollow);
      $bar.append($followSlot);

      if (dom.$chat.length) {
        const $chatBtn = $('<button type="button" class="xhs-btn xhs-btn-outline xhs-btn-long">' + esc(T('chat')) + '</button>');
        $chatBtn.on('click', function (e) {
          e.preventDefault();
          dom.$chat.get(0).click();
        });
        $bar.append($chatBtn);
      }
    }

    $header.find('.xhs-header-overlay').append($bar);
  }

  function buildTopMenu(dom, $header) {
    const own = isOwnProfile();
    const admin = isAdminViewer();
    const $wrap = $('<div id="xhs-profile-topmenu" class="xhs-injected"></div>');
    const $menuWrap = $('<div class="xhs-menu-wrap xhs-topmenu-wrap"></div>');
    const $btn = $('<button type="button" class="xhs-topmenu-btn" aria-label="' + esc(T('more')) + '"><i class="fa fa-ellipsis-h"></i></button>');
    const $menu = $('<div class="xhs-dropdown-menu xhs-topmenu-dropdown" id="xhs-topmenu-dropdown"></div>');

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
      $('.xhs-dropdown-menu').not($menu).removeClass('show');
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

    const $nav = $('<div id="xhs-tab-nav" class="xhs-injected"></div>');
    const $scroll = $('<div class="xhs-tab-scroll"></div>');

    primaryTabs.forEach(function (tab) {
      const active = isTabActive(section, tab.key) ? ' active' : '';
      $scroll.append('<a href="' + tab.href + '" class="xhs-tab' + active + '">' + esc(tab.label) + '</a>');
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
        $btn = $('<button type="button" class="xhs-btn xhs-btn-primary xhs-btn-long">' + esc(T('follow')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $follow.get(0).click();
        });
      } else if (!unfollowHidden && $unfollow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-outline-muted xhs-btn-long">' + esc(T('following')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $unfollow.get(0).click();
        });
      } else if ($follow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-primary xhs-btn-long">' + esc(T('follow')) + '</button>');
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
      '<a href="' + href + '" class="xhs-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</a>'
    );
  }

  function addMenuCustomAction($menu, icon, text, fn) {
    const $item = $(
      '<button type="button" class="xhs-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</button>'
    );
    $item.on('click', function (e) {
      e.preventDefault();
      $('.xhs-dropdown-menu').removeClass('show');
      fn();
    });
    $menu.append($item);
  }

  function addMenuDivider($menu) {
    $menu.append('<div class="xhs-menu-divider"></div>');
  }

  function addMenuAction($menu, $source, icon, text) {
    if (!$source || !$source.length) return;

    const $item = $(
      '<button type="button" class="xhs-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</button>'
    );

    $item.on('click', function (e) {
      e.preventDefault();
      $('.xhs-dropdown-menu').removeClass('show');
      $source.get(0).click();
    });

    $menu.append($item);
  }

  function addMenuMirrorButtons($menu, $a, $b, icon, textA, textB) {
    if ((!$a || !$a.length) && (!$b || !$b.length)) return;

    const $wrapper = $('<div class="xhs-menu-mirror-slot"></div>');

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
        '<button type="button" class="xhs-menu-item">' +
          '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(label) + '</span>' +
        '</button>'
      );

      $item.on('click', function (e) {
        e.preventDefault();
        $('.xhs-dropdown-menu').removeClass('show');
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

    if (section === 'topics') {
      renderNotesSection(dom);
    }

    if (!editable) {
      dom.$accountContent.children('.d-flex.justify-content-between.align-items-center.mb-3').addClass('xhs-hidden');
    }

    if (section === 'about') {
      const bio = getBioText().trim();
      if (bio) {
        dom.$accountContent.children().each(function () {
          const $el = $(this);
          if ($el.hasClass('account-stats')) return false;
          const txt = norm($el.text());
          if (txt === bio || txt.indexOf('关于我') !== -1) {
            $el.addClass('xhs-hidden');
          }
        });
      }
    }

    dom.$stats.find('.card').addClass('xhs-about-card');
  }

  function renderNotesSection(dom) {
    if (getCurrentSection() !== 'topics') return;
    const $content = dom.$accountContent;
    if (!$content.length || $content.find('.xhs-notes-grid').length) return;

    const notes = collectNotesFromDom($content);
    $content.children().not('.xhs-injected').addClass('xhs-notes-original-hidden');

    const $grid = $('<div class="xhs-notes-grid xhs-injected" aria-live="polite"></div>');
    $content.append($grid);

    if (notes.length) {
      renderNotes($grid, notes);
      return;
    }

    $grid.html('<div class="xhs-notes-empty">' + esc(T('notesLoading')) + '</div>');
    fetchNotesFromApi().then(function (apiNotes) {
      if (apiNotes && apiNotes.length) renderNotes($grid, apiNotes);
      else $grid.html('<div class="xhs-notes-empty">' + esc(T('notesEmpty')) + '</div>');
    }).catch(function () {
      $grid.html('<div class="xhs-notes-empty">' + esc(T('notesEmpty')) + '</div>');
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
        ? '<div class="xhs-note-cover" style="background-image:url(&quot;' + esc(note.image) + '&quot;)"></div>'
        : '<div class="xhs-note-cover xhs-note-cover-empty"></div>';
      const excerptHtml = note.excerpt
        ? '<div class="xhs-note-excerpt">' + esc(note.excerpt).slice(0, 90) + '</div>'
        : '';
      $grid.append(
        '<a class="xhs-note-card" href="' + esc(note.href) + '" aria-label="' + esc(T('noteOpen')) + '">' +
          imageHtml +
          '<div class="xhs-note-body">' +
            '<div class="xhs-note-title">' + esc(note.title) + '</div>' +
            excerptHtml +
          '</div>' +
        '</a>'
      );
    });
  }

  function bindGlobalEvents() {
    $(document).off('.xhsProfile');
    $(document).on('click.xhsProfile', function (e) {
      if (!$(e.target).closest('.xhs-menu-wrap').length) {
        $('.xhs-dropdown-menu').removeClass('show');
      }
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
