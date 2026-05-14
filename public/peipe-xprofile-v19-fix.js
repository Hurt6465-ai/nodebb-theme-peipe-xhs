/* Peipe XProfile v19 fix
   - 评价页不再显示 NodeBB 关于/统计原内容
   - 编辑资料不再跳 NodeBB /edit，改为语伴资料弹窗
   - 防止第一次进入一直空白
*/
(function () {
  'use strict';

  if (window.__peipeXProfileV19Fix) return;
  window.__peipeXProfileV19Fix = true;

  var $ = window.jQuery;
  if (!$) return;

  var TEXT = {
    review: '评价',
    notes: '笔记',
    editProfile: '编辑资料',
    partnerProfile: '语伴资料',
    save: '保存资料',
    cancel: '取消',
    close: '关闭',
    ratingTitle: '给 TA 评价',
    ratingPlaceholder: '写一句真实印象，例如：很有耐心，适合练口语。',
    publishReview: '发布评价',
    noReviews: '还没有评价。',
    avgRating: '综合评分',
    peopleRated: '人评分',
    pluginMissing: '评价接口还没安装或返回失败',
    saveOk: '资料已保存',
    saveFail: '保存失败',
    loadFail: '资料读取失败',
    loginFirst: '请先登录',
    displayName: '用户名 / 显示名',
    bio: '介绍',
    country: '国籍 / 地区',
    gender: '性别',
    genderMale: '男',
    genderFemale: '女',
    genderPrivate: '保密',
    nativeLanguages: '母语 / 我会说',
    learningLanguages: '想学语言',
    heightCm: '身高 cm',
    weightKg: '体重 kg',
    education: '学历',
    job: '职业',
    relationship: '感情状况',
    tags: '标签',
    optional: '选填',
    uploadTip: '头像和背景图请先用顶部相机或右上角菜单上传。',
    unemployed: '无业',
    student: '在校生',
    worker: '普通职工',
    waiter: '服务员',
    teacher: '老师',
    police: '警察',
    divorced: '离异'
  };

  function rel(path) {
    var base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    if (/^https?:\/\//i.test(path)) return path;
    if (base && path.indexOf(base + '/') === 0) return path;
    return base + path;
  }

  function csrfToken() {
    return (window.config && (window.config.csrf_token || window.config.csrfToken)) ||
      ($('meta[name="csrf-token"]').attr('content') || '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function toast(msg, type) {
    if (window.app && type === 'error' && typeof app.alertError === 'function') return app.alertError(msg);
    if (window.app && typeof app.alertSuccess === 'function') return app.alertSuccess(msg);
    alert(msg);
  }

  function currentSlug() {
    var m = String(location.pathname || '').match(/^\/user\/([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
    var cls = document.body.className.match(/page-user-([^\s]+)/);
    return cls ? cls[1] : '';
  }

  function currentSection() {
    var path = String(location.pathname || '');
    if (/\/topics(?:[/?#]|$)/.test(path)) return 'topics';
    return 'review';
  }

  function viewedUid() {
    var uid =
      $('[component="avatar/picture"][data-uid]').first().attr('data-uid') ||
      $('[component="avatar/icon"][data-uid]').first().attr('data-uid') ||
      $('.avatar[data-uid]').first().attr('data-uid') ||
      '';
    return String(uid || '').trim();
  }

  function isOwnProfile() {
    var slug = currentSlug().toLowerCase();
    var me = (window.app && app.user) || {};
    return !!(me && (
      String(me.userslug || '').toLowerCase() === slug ||
      String(me.username || '').toLowerCase() === slug ||
      String(me.uid || '') === viewedUid()
    ));
  }

  function fetchJson(url, options) {
    options = options || {};
    options.credentials = 'same-origin';
    options.headers = Object.assign({
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest'
    }, options.headers || {});

    return fetch(rel(url), options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var msg = json.error || json.message || (json.status && json.status.message) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.payload = json;
          throw err;
        }
        return json;
      });
    });
  }

  function releaseBooting() {
    document.body.classList.remove('pxp19-profile-booting');
    document.body.classList.add('pxp19-profile-active', 'pxp19-profile-ready');
  }

  function installEditButtonPatch() {
    var own = isOwnProfile();
    if (!own) return;

    var $bar = $('#pxp19-action-bar');
    if (!$bar.length || $bar.data('pxp19FixEdit')) return;

    var $old = $bar.find('a[href*="/edit"], button').first();
    if (!$old.length) return;

    var $btn = $('<button type="button" class="pxp19-btn pxp19-btn-primary pxp19-btn-long pxp19-edit-partner-profile"></button>');
    $btn.text(TEXT.editProfile);

    $old.replaceWith($btn);
    $bar.data('pxp19FixEdit', true);
  }

  function installAvatarButtonPatch() {
    var $btn = $('#xhsAvatarUploadBtn, .pxp19-avatar-upload-btn').first();
    if (!$btn.length || $btn.data('pxp19FixAvatar')) return;

    $btn.data('pxp19FixAvatar', true);
    $btn.off('click.pxp19FixAvatar').on('click.pxp19FixAvatar', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var $native = $('[component="profile/change/picture"] a[component="profile/change/picture"]').first();
      if ($native.length) {
        $native.get(0).click();
        return;
      }

      var $wrap = $('[component="profile/change/picture"]').first();
      if ($wrap.length) $wrap.trigger('click');
    });
  }

  function reviewEndpointBase() {
    var uid = viewedUid();
    var slug = currentSlug();
    return uid || slug;
  }

  function normalizeReviewPayload(json) {
    var data = json && (json.response || json.data || json);
    var items = data.items || data.reviews || [];
    var avg = Number(data.avg || data.average || data.rating || 0) || 0;
    var count = Number(data.count || data.total || items.length || 0) || 0;
    return { avg: avg, count: count, items: Array.isArray(items) ? items : [] };
  }

  function getReviews() {
    var id = encodeURIComponent(reviewEndpointBase());
    var endpoints = [
      '/api/peipe-profile/reviews/' + id,
      '/api/plugins/peipe-profile/reviews/' + id,
      '/api/peipe-profile-reviews/' + id
    ];

    var p = Promise.reject(new Error('start'));
    endpoints.forEach(function (url) {
      p = p.catch(function () { return fetchJson(url); });
    });
    return p.then(normalizeReviewPayload);
  }

  function postReview(rating, content) {
    var id = encodeURIComponent(reviewEndpointBase());
    var body = JSON.stringify({ rating: rating, content: content });
    var endpoints = [
      '/api/peipe-profile/reviews/' + id,
      '/api/plugins/peipe-profile/reviews/' + id,
      '/api/peipe-profile-reviews/' + id
    ];

    var p = Promise.reject(new Error('start'));
    endpoints.forEach(function (url) {
      p = p.catch(function () {
        return fetchJson(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-csrf-token': csrfToken()
          },
          body: body
        });
      });
    });
    return p;
  }

  function starsHtml(value, interactive) {
    var n = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    var out = '';
    for (var i = 1; i <= 5; i += 1) {
      out += '<button type="button" class="pxp19-star ' + (i <= n ? 'active' : '') + '" data-star="' + i + '"' +
        (interactive ? '' : ' tabindex="-1" aria-hidden="true"') + '>★</button>';
    }
    return out;
  }

  function renderReviewItems(items) {
    if (!items || !items.length) {
      return '<div class="pxp19-review-empty">' + esc(TEXT.noReviews) + '</div>';
    }

    return items.map(function (item) {
      var user = item.user || item.author || {};
      var name = user.displayname || user.username || item.username || '用户';
      var avatar = user.picture || item.picture || '';
      var rating = item.rating || item.score || 0;
      var content = item.content || item.text || item.comment || '';
      var time = item.createdAt || item.timestamp || '';

      return '' +
        '<div class="pxp19-review-item">' +
          '<div class="pxp19-review-avatar">' +
            (avatar ? '<img src="' + esc(avatar) + '" alt="">' : '<span>' + esc(String(name).slice(0, 1).toUpperCase()) + '</span>') +
          '</div>' +
          '<div class="pxp19-review-body">' +
            '<div class="pxp19-review-head">' +
              '<strong>' + esc(name) + '</strong>' +
              '<span class="pxp19-review-mini-stars">' + starsHtml(rating, false) + '</span>' +
            '</div>' +
            (content ? '<div class="pxp19-review-text">' + esc(content) + '</div>' : '') +
            (time ? '<div class="pxp19-review-time">' + esc(time) + '</div>' : '') +
          '</div>' +
        '</div>';
    }).join('');
  }

  function renderReviewTab() {
    if (currentSection() !== 'review') return;

    var $content = $('.account-content').first();
    if (!$content.length) return;

    var key = location.pathname + ':' + viewedUid();
    if ($content.data('pxp19ReviewKey') === key) return;
    $content.data('pxp19ReviewKey', key);

    $content.children().addClass('pxp19-review-original-hidden');

    var $panel = $('' +
      '<section class="pxp19-review-panel pxp19-injected">' +
        '<div class="pxp19-review-summary">' +
          '<div class="pxp19-review-score">0.0</div>' +
          '<div class="pxp19-review-summary-right">' +
            '<div class="pxp19-review-stars">' + starsHtml(0, false) + '</div>' +
            '<div class="pxp19-review-count">0 ' + esc(TEXT.peopleRated) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pxp19-review-form">' +
          '<div class="pxp19-review-form-title">' + esc(TEXT.ratingTitle) + '</div>' +
          '<div class="pxp19-review-input-stars" data-rating="5">' + starsHtml(5, true) + '</div>' +
          '<textarea class="pxp19-review-textarea" maxlength="300" placeholder="' + esc(TEXT.ratingPlaceholder) + '"></textarea>' +
          '<button type="button" class="pxp19-review-submit">' + esc(TEXT.publishReview) + '</button>' +
        '</div>' +
        '<div class="pxp19-review-list"><div class="pxp19-review-loading">加载中...</div></div>' +
      '</section>'
    );

    $content.append($panel);

    getReviews().then(function (data) {
      var avg = Math.max(0, Math.min(5, Number(data.avg || 0)));
      $panel.find('.pxp19-review-score').text(avg.toFixed(1));
      $panel.find('.pxp19-review-stars').html(starsHtml(avg, false));
      $panel.find('.pxp19-review-count').text((data.count || 0) + ' ' + TEXT.peopleRated);
      $panel.find('.pxp19-review-list').html(renderReviewItems(data.items));
    }).catch(function () {
      $panel.find('.pxp19-review-list').html('<div class="pxp19-review-empty">' + esc(TEXT.noReviews) + '</div>');
    });
  }

  function bindReviewEvents() {
    $(document)
      .off('click.pxp19ReviewStar')
      .on('click.pxp19ReviewStar', '.pxp19-review-input-stars .pxp19-star', function () {
        var $wrap = $(this).closest('.pxp19-review-input-stars');
        var val = Number($(this).attr('data-star') || 5);
        $wrap.attr('data-rating', val);
        $wrap.find('.pxp19-star').each(function () {
          $(this).toggleClass('active', Number($(this).attr('data-star')) <= val);
        });
      });

    $(document)
      .off('click.pxp19ReviewSubmit')
      .on('click.pxp19ReviewSubmit', '.pxp19-review-submit', function () {
        var me = (window.app && app.user) || {};
        if (!me.uid) return toast(TEXT.loginFirst, 'error');

        var $btn = $(this);
        var $form = $btn.closest('.pxp19-review-form');
        var rating = Number($form.find('.pxp19-review-input-stars').attr('data-rating') || 5);
        var content = norm($form.find('.pxp19-review-textarea').val());

        $btn.prop('disabled', true).text('发布中...');
        postReview(rating, content).then(function () {
          $('.account-content').removeData('pxp19ReviewKey');
          renderReviewTab();
          toast('评价已发布');
        }).catch(function (err) {
          toast((err && err.status === 404) ? TEXT.pluginMissing : '评价发布失败', 'error');
        }).finally(function () {
          $btn.prop('disabled', false).text(TEXT.publishReview);
        });
      });
  }

  function selectValue(value, options) {
    value = String(value || '');
    return options.map(function (item) {
      var val = Array.isArray(item) ? item[0] : item;
      var label = Array.isArray(item) ? item[1] : item;
      return '<option value="' + esc(val) + '"' + (String(val) === value ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  function fieldHtml(name, label, value, placeholder) {
    return '' +
      '<label class="pxp19-editor-field">' +
        '<span>' + esc(label) + '</span>' +
        '<input name="' + esc(name) + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
      '</label>';
  }

  function textareaHtml(name, label, value, placeholder) {
    return '' +
      '<label class="pxp19-editor-field pxp19-editor-field-full">' +
        '<span>' + esc(label) + '</span>' +
        '<textarea name="' + esc(name) + '" rows="3" placeholder="' + esc(placeholder || '') + '">' + esc(value || '') + '</textarea>' +
      '</label>';
  }

  function readProfileFromDom() {
    var stats = {};
    $('.account-stats .stat').each(function () {
      var label = norm($(this).find('.stat-label').text());
      var val = norm($(this).find('.ff-secondary').last().text());
      if (label) stats[label] = val;
    });

    return {
      displayName: norm($('.pxp19-display-name').first().text() || $('.fullname').first().text()),
      bio: norm($('.pxp19-bio').first().text() || $('[component="aboutme"]').first().text()),
      country: norm(stats['国籍'] || $('.pxp19-country-line span').first().text()),
      gender: norm(stats['性别']),
      nativeLanguages: norm(stats['母语']),
      learningLanguages: norm(stats['正在学习的语言']),
      heightCm: norm(stats['身高']),
      weightKg: norm(stats['体重']),
      education: norm(stats['学历']),
      job: norm(stats['职业']),
      relationship: norm(stats['感情状况']),
      tags: norm(stats['标签'])
    };
  }

  function getPartnerProfile() {
    var fallback = readProfileFromDom();
    return fetchJson('/api/peipe-partners/swipe/me')
      .then(function (json) { return Object.assign({}, fallback, json.response || json.data || json); })
      .catch(function () { return fallback; });
  }

  function savePartnerProfile(payload) {
    var body = JSON.stringify(payload);
    var endpoints = [
      '/api/peipe-partners/swipe/me',
      '/api/plugins/peipe-partners/swipe/me',
      '/api/peipe-partners/profile/me'
    ];

    var p = Promise.reject(new Error('start'));
    endpoints.forEach(function (url) {
      p = p.catch(function () {
        return fetchJson(url, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-csrf-token': csrfToken()
          },
          body: body
        });
      });
    });
    return p;
  }

  function openPartnerEditor() {
    if (window.PEIPE_PARTNER_PROFILE && typeof window.PEIPE_PARTNER_PROFILE.openEditor === 'function') {
      window.PEIPE_PARTNER_PROFILE.openEditor();
      return;
    }

    if (!$('#pxp19-partner-editor').length) {
      $('body').append('' +
        '<div id="pxp19-partner-editor-mask"></div>' +
        '<section id="pxp19-partner-editor" role="dialog" aria-modal="true">' +
          '<div class="pxp19-editor-head">' +
            '<div class="pxp19-editor-title">' + esc(TEXT.partnerProfile) + '</div>' +
            '<button type="button" class="pxp19-editor-close" aria-label="' + esc(TEXT.close) + '">×</button>' +
          '</div>' +
          '<div class="pxp19-editor-body"><div class="pxp19-editor-loading">加载中...</div></div>' +
          '<div class="pxp19-editor-actions">' +
            '<button type="button" class="pxp19-editor-cancel">' + esc(TEXT.cancel) + '</button>' +
            '<button type="button" class="pxp19-editor-save">' + esc(TEXT.save) + '</button>' +
          '</div>' +
        '</section>'
      );
    }

    $('#pxp19-partner-editor-mask, #pxp19-partner-editor').addClass('show');
    $('#pxp19-partner-editor .pxp19-editor-body').html('<div class="pxp19-editor-loading">加载中...</div>');

    getPartnerProfile().then(function (p) {
      renderPartnerEditorForm(p || {});
    }).catch(function () {
      renderPartnerEditorForm(readProfileFromDom());
      toast(TEXT.loadFail, 'error');
    });
  }

  function renderPartnerEditorForm(p) {
    var html = '' +
      '<div class="pxp19-editor-tip">' + esc(TEXT.uploadTip) + '</div>' +
      '<form class="pxp19-editor-form">' +
        fieldHtml('displayName', TEXT.displayName, p.displayName || p.username || p.name) +
        textareaHtml('bio', TEXT.bio, p.bio || p.aboutme || p.intro) +
        fieldHtml('country', TEXT.country, p.country || p.nationality) +
        '<label class="pxp19-editor-field"><span>' + esc(TEXT.gender) + '</span><select name="gender">' +
          selectValue(p.gender, [['male', TEXT.genderMale], ['female', TEXT.genderFemale], ['private', TEXT.genderPrivate]]) +
        '</select></label>' +
        fieldHtml('nativeLanguages', TEXT.nativeLanguages, p.nativeLanguages || p.nativeLanguage || p.native_lang, 'CN, EN') +
        fieldHtml('learningLanguages', TEXT.learningLanguages, p.learningLanguages || p.learningLanguage || p.learn_lang, 'JP, MM') +
        fieldHtml('heightCm', TEXT.heightCm, p.heightCm || p.height_cm, '170') +
        fieldHtml('weightKg', TEXT.weightKg, p.weightKg || p.weight_kg, '60') +
        fieldHtml('education', TEXT.education, p.education, TEXT.optional) +
        '<label class="pxp19-editor-field"><span>' + esc(TEXT.job) + '</span><select name="job">' +
          selectValue(p.job, [
            ['', TEXT.optional],
            ['student', TEXT.student],
            ['worker', TEXT.worker],
            ['waiter', TEXT.waiter],
            ['teacher', TEXT.teacher],
            ['police', TEXT.police],
            ['unemployed', TEXT.unemployed]
          ]) +
        '</select></label>' +
        '<label class="pxp19-editor-field"><span>' + esc(TEXT.relationship) + '</span><select name="relationship">' +
          selectValue(p.relationship, [
            ['', TEXT.optional],
            ['single', '单身'],
            ['dating', '恋爱中'],
            ['married', '已婚'],
            ['divorced', TEXT.divorced],
            ['private', '保密']
          ]) +
        '</select></label>' +
        fieldHtml('tags', TEXT.tags, Array.isArray(p.tags) ? p.tags.join(', ') : p.tags, '认真, 有耐心, 语音练习') +
      '</form>';

    $('#pxp19-partner-editor .pxp19-editor-body').html(html);
  }

  function closePartnerEditor() {
    $('#pxp19-partner-editor-mask, #pxp19-partner-editor').removeClass('show');
  }

  function bindEditorEvents() {
    $(document)
      .off('click.pxp19OpenPartnerEditor')
      .on('click.pxp19OpenPartnerEditor', '.pxp19-edit-partner-profile', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPartnerEditor();
      });

    $(document)
      .off('click.pxp19ClosePartnerEditor')
      .on('click.pxp19ClosePartnerEditor', '#pxp19-partner-editor-mask, .pxp19-editor-close, .pxp19-editor-cancel', function (e) {
        e.preventDefault();
        closePartnerEditor();
      });

    $(document)
      .off('click.pxp19SavePartnerEditor')
      .on('click.pxp19SavePartnerEditor', '.pxp19-editor-save', function () {
        var $btn = $(this);
        var data = {};
        $('#pxp19-partner-editor .pxp19-editor-form').serializeArray().forEach(function (item) {
          data[item.name] = norm(item.value);
        });

        data.nativeLanguages = data.nativeLanguages ? data.nativeLanguages.split(/[,\s，、]+/).filter(Boolean) : [];
        data.learningLanguages = data.learningLanguages ? data.learningLanguages.split(/[,\s，、]+/).filter(Boolean) : [];
        data.tags = data.tags ? data.tags.split(/[,\s，、]+/).filter(Boolean) : [];

        $btn.prop('disabled', true).text('保存中...');
        savePartnerProfile(data).then(function () {
          closePartnerEditor();
          toast(TEXT.saveOk);
          if (window.ajaxify && typeof ajaxify.refresh === 'function') {
            ajaxify.refresh();
          } else {
            location.reload();
          }
        }).catch(function (err) {
          toast((err && err.message) || TEXT.saveFail, 'error');
        }).finally(function () {
          $btn.prop('disabled', false).text(TEXT.save);
        });
      });
  }

  function run() {
    if (!/^\/user\//.test(location.pathname || '')) return;

    releaseBooting();
    installEditButtonPatch();
    installAvatarButtonPatch();

    if (currentSection() === 'review') {
      renderReviewTab();
    }
  }

  bindReviewEvents();
  bindEditorEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  $(window).on('action:ajaxify.end action:posts.loaded action:topic.loaded', function () {
    setTimeout(run, 60);
    setTimeout(run, 260);
  });

  setTimeout(run, 300);
  setTimeout(run, 900);
  setTimeout(releaseBooting, 2200);
})();
