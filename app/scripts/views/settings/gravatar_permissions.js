/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const Cocktail = require('cocktail');
  const FormView = require('views/form');
  const ModalSettingsPanelMixin = require('views/mixins/modal-settings-panel-mixin');
  const p = require('lib/promise');
  const ServiceMixin = require('views/mixins/service-mixin');
  const Template = require('stache!templates/settings/gravatar_permissions');

  const GRAVATAR_MOCK_CLIENT_ID = 'gravatar';
  const GRAVATAR_PERMISSION = 'profile:email';

  const View = FormView.extend({
    template: Template,
    className: 'gravatar-permissions',
    viewName: 'settings.gravatar-permissions',

    context () {
      const email = this.getSignedInAccount().get('email');

      // w/o a context, `this.translate` calls `this.getContext()` which
      // calls this function, causing infinite recursion. Pass the
      // context to avoid infinite recursion.
      const serviceName = this.translate('Gravatar', {});

      return {
        email,
        serviceName
      };
    },

    beforeRender () {
      var account = this.getSignedInAccount();
      if (account.getClientPermission(GRAVATAR_MOCK_CLIENT_ID, GRAVATAR_PERMISSION)) {
        this.logViewEvent('already-accepted');
        this.navigate('settings/avatar/gravatar');
      }
    },

    submit () {
      var account = this.getSignedInAccount();
      this.logViewEvent('accept');

      return p().then(() => {
        var permissions = {};
        permissions[GRAVATAR_PERMISSION] = true;
        account.setClientPermissions(GRAVATAR_MOCK_CLIENT_ID, permissions);
        this.user.setAccount(account);
        this.navigate('settings/avatar/gravatar');
      });
    }
  }, {
    GRAVATAR_MOCK_CLIENT_ID: GRAVATAR_MOCK_CLIENT_ID,
    GRAVATAR_PERMISSION: GRAVATAR_PERMISSION
  });


  Cocktail.mixin(
    View,
    ModalSettingsPanelMixin,
    ServiceMixin
  );

  module.exports = View;
});
