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

  $(window).on('action:ajaxify.end', function () {
    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
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
      return;
    }

    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
      return;
    }

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
      }
    }

    // DOM 还没来时主动监听，不需要用户刷新。
    if (!pageDomObserver) {
      const host = document.getElementById('content') || document.querySelector('main#panel') || document.body;
      pageDomObserver = new MutationObserver(function () {
        const found = findAccountAndTop();
        if (found) boot(found);
      });
      pageDomObserver.observe(host, { childList: true, subtree: true });
    }

    initRaf = requestAnimationFrame(attempt);
  }

  function initXiaohongshuProfile($account, $top) {
    cleanupInjected();
    if (window.innerWidth > MOBILE_MAX) return;

    const dom = getDomCache($account, $top);
    if (!dom.$account.length || !dom.$top.length) return;

    injectStyle();
    hideGlobalNavigation();
    hideOriginalElements(dom);
    buildProfileShell(dom);
    tweakContentArea(dom);
    bindGlobalEvents();
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
    $('body').removeClass('xhs-profile-active');
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
        '<button type="button" class="xhs-avatar-upload-btn" id="xhsAvatarUploadBtn" aria-label="上传头像">' +
          '<i class="fa fa-camera"></i>' +
        '</button>';
    }

    const avatarFlagHtml = avatarFlag
      ? '<span class="xhs-avatar-flag">' + avatarFlag + '</span>'
      : '';

    let genderAgeHtml = '';
    if (gender || age) {
      const gaText = [gender, age ? age + '岁' : ''].filter(Boolean).join(' ');
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
      { num: getFollowingCount(), label: '关注', href: '/user/' + slug + '/following' },
      { num: getFollowersCount(), label: '粉丝', href: '/user/' + slug + '/followers' },
      { num: getViewsCount(), label: '浏览', href: '' }
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
        const $viewBtn = $('<a href="/user/' + getViewedSlug() + '" class="xhs-btn xhs-btn-outline xhs-btn-long">返回主页</a>');
        $bar.append($viewBtn);
      } else {
        const $editBtn = $('<a href="/user/' + getViewedSlug() + '/edit" class="xhs-btn xhs-btn-primary xhs-btn-long">编辑资料</a>');
        $bar.append($editBtn);
      }
    } else {
      const $followSlot = $('<div class="xhs-btn-slot xhs-btn-long-slot"></div>');
      mirrorFollowState($followSlot, dom.$follow, dom.$unfollow);
      $bar.append($followSlot);

      if (dom.$chat.length) {
        const $chatBtn = $('<button type="button" class="xhs-btn xhs-btn-outline xhs-btn-long">聊天</button>');
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
    const $btn = $('<button type="button" class="xhs-topmenu-btn" aria-label="更多"><i class="fa fa-ellipsis-h"></i></button>');
    const $menu = $('<div class="xhs-dropdown-menu xhs-topmenu-dropdown" id="xhs-topmenu-dropdown"></div>');

    if (own) {
      addMenuLink($menu, '/user/' + getViewedSlug() + '/settings', 'fa-gear', '设置');
      addMenuLink($menu, '/user/' + getViewedSlug() + '/theme', 'fa-paint-brush', '主题设置');
      addMenuDivider($menu);
      addMenuCustomAction($menu, 'fa-camera', '上传头像', function () {
        triggerAvatarUpload(dom);
      });
      addMenuAction($menu, dom.$coverUpload, 'fa-image', '上传背景');
      addMenuAction($menu, dom.$coverResize, 'fa-arrows-alt', '调整背景');
      addMenuAction($menu, dom.$coverRemove, 'fa-trash', '移除背景');
    } else {
      if (admin) {
        addMenuLink($menu, '/user/' + getViewedSlug() + '/info', 'fa-id-card', '账号信息');
        addMenuMirrorButtons($menu, dom.$mute, dom.$unmute, 'fa-volume-xmark', '禁言账号', '解除禁言');
        addMenuMirrorButtons($menu, dom.$ban, dom.$unban, 'fa-ban', '封禁账户', '解除封禁');
        addMenuAction($menu, dom.$deleteAccount, 'fa-trash', '删除账号');
        addMenuAction($menu, dom.$deleteContent, 'fa-eraser', '删除内容');
        addMenuAction($menu, dom.$deleteAll, 'fa-bomb', '删号和内容');
        addMenuDivider($menu);
      }
      addMenuMirrorButtons($menu, dom.$flag, dom.$alreadyFlagged, 'fa-flag', '举报资料', '已举报');
      addMenuMirrorButtons($menu, dom.$block, dom.$unblock, 'fa-eye-slash', '屏蔽用户', '解除屏蔽');
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
      { key: 'about', label: '主页', href: '/user/' + slug },
      { key: 'topics', label: '笔记', href: '/user/' + slug + '/topics' }
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
        $btn = $('<button type="button" class="xhs-btn xhs-btn-primary xhs-btn-long">关注</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $follow.get(0).click();
        });
      } else if (!unfollowHidden && $unfollow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-outline-muted xhs-btn-long">已关注</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $unfollow.get(0).click();
        });
      } else if ($follow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-primary xhs-btn-long">关注</button>');
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

  function injectStyle() {
    if (document.getElementById('xhs-profile-style-v11')) return;

    $('head').append(`
<style id="xhs-profile-style-v11">
@media (max-width: 768px) {
  body.xhs-profile-active {
    overflow-x: hidden !important;
    background: #fff !important;
  }

  body.xhs-profile-active [component="bottombar"] {
    display: none !important;
  }

  body.xhs-profile-active .sidebar-left,
  body.xhs-profile-active .sidebar-right {
    display: none !important;
  }

  body.xhs-profile-active main#panel {
    margin-top: 0 !important;
    padding-top: 0 !important;
  }

  body.xhs-profile-active .layout-container {
    padding-bottom: 0 !important;
  }

  body.xhs-profile-active #content {
    padding-left: 0 !important;
    padding-right: 0 !important;
    max-width: 100% !important;
  }

  body.xhs-profile-active .account {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100% !important;
    overflow: visible !important;
  }

  .xhs-original-top-hidden,
  .xhs-hidden {
    display: none !important;
  }

  .xhs-cover-raw {
    position: absolute !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }

  body.xhs-profile-active .fixed-bottom .navigator-mobile {
    display: none !important;
  }

  #xhs-profile-shell {
    position: relative;
    z-index: 50;
    background: #fff;
  }

  #xhs-profile-header {
    position: relative;
    width: 100%;
    min-height: 340px;
    overflow: visible;
    background: #fff;
    z-index: 160;
  }

  .xhs-cover {
    width: 100%;
    height: 340px;
    background-size: cover;
    background-position: center top;
    background-repeat: no-repeat;
    position: absolute;
    inset: 0;
  }

  .xhs-cover-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.26) 55%, rgba(0,0,0,0.58) 100%);
    z-index: 1;
  }

  .xhs-header-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 16px;
    z-index: 2;
    padding: 0 16px;
    overflow: visible;
  }

  #xhs-profile-header.xhs-no-bio .xhs-header-overlay {
    bottom: 18px;
  }

  #xhs-profile-topmenu {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 5000;
    overflow: visible;
  }

  .xhs-topmenu-wrap {
    position: relative;
  }

  .xhs-topmenu-btn {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.26);
    background: rgba(0,0,0,0.26);
    color: #fff;
    backdrop-filter: blur(10px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 6px 18px rgba(0,0,0,0.18);
  }

  .xhs-topmenu-btn i {
    font-size: 16px;
  }

  .xhs-user-main {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .xhs-avatar-wrap {
    position: relative;
    flex: 0 0 92px;
    width: 92px;
    min-width: 92px;
    display: flex;
    justify-content: flex-start;
  }

  .xhs-avatar-circle {
    width: 92px;
    height: 92px;
    border-radius: 50%;
    overflow: hidden;
    border: 1.5px solid rgba(255,255,255,0.98);
    box-shadow: 0 6px 18px rgba(0,0,0,0.18);
    background: #f5f5f5;
  }

  .xhs-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .xhs-avatar-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 34px;
    font-weight: 700;
  }

  .xhs-avatar-upload-btn {
    position: absolute;
    right: -2px;
    bottom: 4px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: #ff2442;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(255,36,66,0.25);
    padding: 0;
    z-index: 3;
  }

  .xhs-avatar-flag {
    position: absolute;
    left: -1px;
    bottom: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    line-height: 1;
    z-index: 4;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.24));
    pointer-events: none;
  }

  .xhs-user-right {
    min-width: 0;
    flex: 1;
    padding-top: 2px;
  }

  .xhs-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .xhs-display-name {
    font-size: 25px;
    font-weight: 800;
    color: #fff;
    line-height: 1.18;
    letter-spacing: -0.02em;
    text-shadow: 0 2px 8px rgba(0,0,0,0.46);
    word-break: break-word;
  }

  .xhs-mm-name {
    line-height: 1.36;
    padding-top: 1px;
  }

  .xhs-gender-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.22);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.24);
    text-shadow: 0 1px 3px rgba(0,0,0,0.28);
  }

  .xhs-language-line,
  .xhs-country-line {
    margin-top: 6px;
    font-size: 13px;
    color: #fff;
    font-weight: 700;
    text-shadow: 0 2px 8px rgba(0,0,0,0.46);
    line-height: 1.45;
  }

  .xhs-lang-part {
    display: inline-block;
    vertical-align: middle;
  }

  .xhs-lang-arrow {
    display: inline-block;
    vertical-align: middle;
    margin: 0 4px;
    font-size: 11px;
    font-weight: 500;
    opacity: 0.88;
    transform: translateY(-0.5px);
  }

  .xhs-country-line {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .xhs-country-line i {
    font-size: 12px;
  }

  .xhs-mm-text {
    line-height: 1.72;
    padding-top: 1px;
  }

  .xhs-bio {
    margin-top: 12px;
    max-width: 16em;
    font-size: 13px;
    line-height: 1.62;
    color: #fff;
    text-shadow: 0 1px 6px rgba(0,0,0,0.6);
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .xhs-mm-bio {
    line-height: 1.92;
    padding-top: 1px;
  }

  #xhs-stats-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 28px;
    padding: 14px 0 0 0;
  }

  .xhs-stat-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-decoration: none !important;
  }

  .xhs-stat-num {
    font-size: 21px;
    font-weight: 800;
    color: #fff;
    line-height: 1;
    text-shadow: 0 1px 5px rgba(0,0,0,0.35);
  }

  .xhs-stat-label {
    font-size: 12px;
    color: rgba(255,255,255,0.92);
    font-weight: 700;
    margin-top: 6px;
    text-shadow: 0 1px 4px rgba(0,0,0,0.35);
  }

  #xhs-action-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 0 0 0;
  }

  .xhs-btn-slot {
    display: flex;
    min-width: 0;
  }

  .xhs-btn-long-slot {
    flex: 1 1 auto;
  }

  .xhs-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    padding: 0 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 800;
    border: none;
    cursor: pointer;
    text-decoration: none !important;
    white-space: nowrap;
    transition: all 0.18s ease;
    line-height: 1;
  }

  .xhs-btn-long {
    min-width: 112px;
    flex: 1 1 auto;
  }

  .xhs-btn-primary {
    background: #ff2442;
    color: #fff !important;
    box-shadow: 0 4px 12px rgba(255,36,66,0.22);
  }

  .xhs-btn-primary:active {
    background: #e41d3a;
    transform: translateY(1px);
  }

  .xhs-btn-outline {
    background: rgba(0,0,0,0.28);
    color: #fff !important;
    border: 1px solid rgba(255,255,255,0.24);
    backdrop-filter: blur(8px);
  }

  .xhs-btn-outline:active {
    background: rgba(0,0,0,0.38);
  }

  .xhs-btn-outline-muted {
    background: rgba(0,0,0,0.38);
    color: rgba(255,255,255,0.86) !important;
    border: 1px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(8px);
  }

  .xhs-menu-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .xhs-dropdown-menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    min-width: 188px;
    padding: 6px;
    border-radius: 16px;
    background: rgba(255,255,255,0.98);
    box-shadow: 0 16px 36px rgba(0,0,0,0.18);
    display: none;
    z-index: 99999;
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0,0,0,0.04);
  }

  .xhs-dropdown-menu.show {
    display: block;
  }

  .xhs-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
    color: #333 !important;
    background: transparent;
    border: none;
    text-decoration: none !important;
    text-align: left;
    cursor: pointer;
  }

  .xhs-menu-item:active,
  .xhs-menu-item.active {
    background: #f5f5f5;
  }

  .xhs-menu-item i {
    color: #8f8f8f;
    font-size: 14px;
    width: 18px;
    text-align: center;
    text-shadow: none;
  }

  .xhs-menu-divider {
    height: 1px;
    background: #f0f0f0;
    margin: 6px 4px;
  }

  #xhs-tab-nav {
    position: relative;
    z-index: 35;
    background: #fff;
    padding: 14px 0 10px 0;
    margin: 0;
  }

  .xhs-tab-scroll {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 14px;
    padding: 0 16px;
  }

  .xhs-tab {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 76px;
    height: 36px;
    padding: 0 16px;
    font-size: 15px;
    font-weight: 700;
    color: #7e7e7e !important;
    text-decoration: none !important;
    border: none;
    border-radius: 999px;
    background: #f7f7f7;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .xhs-tab.active {
    color: #ff2442 !important;
    background: #fff1f4;
  }

  body.xhs-profile-active .account-content {
    padding: 16px 16px 88px 16px !important;
    min-height: 30vh;
    position: relative;
    z-index: 1;
    background: #fff;
  }

  body.xhs-profile-active .account-content > * {
    padding-left: 0 !important;
    padding-right: 0 !important;
  }

  body.xhs-profile-active .account-stats.container {
    padding-left: 0 !important;
    padding-right: 0 !important;
  }

  .xhs-about-card {
    border: 1px solid #f0f0f0 !important;
    border-radius: 14px !important;
    box-shadow: none !important;
    background: #fafafa !important;
  }

  body.xhs-profile-active .alert {
    border-radius: 12px;
    font-size: 14px;
    margin-left: 0;
    margin-right: 0;
  }

  body.xhs-profile-active .topics-list .topic-row,
  body.xhs-profile-active .topics-list > li {
    border-radius: 12px;
    margin-bottom: 8px;
  }

  body.xhs-profile-active [data-widget-area="header"] {
    display: none !important;
  }

  body.xhs-profile-active .xhs-account-layout {
    flex-direction: column !important;
  }
}
</style>
    `);
  }
})();
