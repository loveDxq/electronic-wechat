"use strict";
const ipcRenderer = require('electron').ipcRenderer;
const webFrame = require('web-frame');
const MenuHandler = require('../handlers/menu');
const ShareMenu = require('./share_menu');
const MentionMenu = require('./mention_menu');
const BadgeCount = require('./badge_count');
const Common = require("../common");


class Injector {
  init() {
    if (Common.DEBUG_MODE) {
      Injector.lock(window, 'console', window.console);
    }

    this.initInjectBundle();
    this.initAngularInjection();
    webFrame.setZoomLevelLimits(1, 1);

    new MenuHandler().create();
  }

  initAngularInjection() {
    let self = this;
    let angular = window.angular = {};
    let angularBootstrapReal;
    Object.defineProperty(angular, 'bootstrap', {
      get: () => angularBootstrapReal ? function (element, moduleNames) {
        const moduleName = 'webwxApp';
        if (moduleNames.indexOf(moduleName) < 0) return;
        let constants = null;
        angular.injector(['ng', 'Services']).invoke(['confFactory', (confFactory) => (constants = confFactory)]);
        angular.module(moduleName).config(['$httpProvider', ($httpProvider) => {
          $httpProvider.defaults.transformResponse.push((value)=> {
            return self.transformResponse(value, constants);
          });
        }
        ]).run(['$rootScope', ($rootScope) => {
          ipcRenderer.send("wx-rendered", MMCgi.isLogin);

          $rootScope.$on("newLoginPage", () => {
            ipcRenderer.send("user-logged", "");
          });
          $rootScope.shareMenu = ShareMenu.inject;
          $rootScope.mentionMenu = MentionMenu.inject;
        }]);
        return angularBootstrapReal.apply(angular, arguments);
      } : angularBootstrapReal,
      set: (real) => (angularBootstrapReal = real)
    });
  }

  initInjectBundle() {
    let initModules = ()=> {
      if (!window.$) {
        return setTimeout(initModules, 3000);
      }

      MentionMenu.init();
      BadgeCount.init();
    };

    window.onload = () => {
      initModules();
      window.addEventListener('online', ()=> {
        ipcRenderer.send('reload', true);
      });
    };
  }

  transformResponse(value, constants) {
    if (!value) return value;

    switch (typeof value) {
      case 'object':
        /* Inject emoji stickers and prevent recalling. */
        return this.checkEmojiContent(value, constants);
      case 'string':
        /* Inject share sites to menu. */
        return this.checkTemplateContent(value);
    }
    return value;
  }

  static lock(object, key, value) {
    return Object.defineProperty(object, key, {
      get: () => value,
      set: () => {
      }
    });
  }

  checkEmojiContent(value, constants) {
    if (!(value.AddMsgList instanceof Array)) return value;
    value.AddMsgList.forEach((msg) => {
      switch (msg.MsgType) {
        case constants.MSGTYPE_EMOTICON:
          Injector.lock(msg, 'MMDigest', '[Emoticon]');
          Injector.lock(msg, 'MsgType', constants.MSGTYPE_EMOTICON);
          if (msg.ImgHeight >= Common.EMOJI_MAXIUM_SIZE) {
            Injector.lock(msg, 'MMImgStyle', {height: `${Common.EMOJI_MAXIUM_SIZE}px`, width: 'initial'});
          } else if (msg.ImgWidth >= Common.EMOJI_MAXIUM_SIZE) {
            Injector.lock(msg, 'MMImgStyle', {width: `${Common.EMOJI_MAXIUM_SIZE}px`, height: 'initial'});
          }
          break;
        case constants.MSGTYPE_RECALLED:
          Injector.lock(msg, 'MsgType', constants.MSGTYPE_SYS);
          Injector.lock(msg, 'MMActualContent', Common.MESSAGE_PREVENT_RECALL);
          Injector.lock(msg, 'MMDigest', Common.MESSAGE_PREVENT_RECALL);
          break;
      }
    });
    return value;
  }

  checkTemplateContent(value) {
    let optionMenuReg = /optionMenu\(\);/;
    let messageBoxKeydownReg = /editAreaKeydown\(\$event\)/;
    if (optionMenuReg.test(value)) {
      value = value.replace(optionMenuReg, "optionMenu();shareMenu();");
    } else if (messageBoxKeydownReg.test(value)) {
      value = value.replace(messageBoxKeydownReg, "editAreaKeydown($event);mentionMenu($event);");
    }
    return value;
  }
}

new Injector().init();