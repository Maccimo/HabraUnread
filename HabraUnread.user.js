// ==UserScript==
// @name        HabraUnread
// @namespace   https://github.com/Maccimo/
// @author      Maccimo
// @description Mark comments as unread on Habrahabr
// @match       *://habr.com/*/post/*
// @match       *://habr.com/*/blog/*
// @match       *://habr.com/*/news/*
// @match       *://habr.com/*/article/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @resource    icons https://raw.githubusercontent.com/Maccimo/HabraUnread/master/icons.svg
// @resource    styles https://raw.githubusercontent.com/Maccimo/HabraUnread/master/styles.css
// @grant       GM.getResourceUrl
// @version     1.0
// ==/UserScript==

(async function(document) {

  const NS_SVG = "http://www.w3.org/2000/svg";
  const NS_XLINK = "http://www.w3.org/1999/xlink";

  const DEBUG = false;

  function debug(message) {
    if (DEBUG) {
      console.log(message);
    }
  }

  /**
   * TamperMonkey may fallback to the "application" string as a resource MIME type in the data: URL.
   * This may lead to incorrect resource handling, at least in Chrome.
   * To overcome we construct a new blob URL with the proper MIME type.
   */
  function getResourceUrlForceMime(resourceId, mimeType) {
    return GM.getResourceUrl(resourceId)
      .then(resourceUrl => fetch(resourceUrl))
      .then(data => data.blob())
      .then(blob => new Blob([blob], { type: mimeType }))
      .then(blob => URL.createObjectURL(blob));
  }

  debug("[HabraUnread] Starting " + GM.info.script.name + " version " + GM.info.script.version);

  const iconsUrl = await getResourceUrlForceMime("icons", "image/svg+xml");
  const envelopeIconUrl = iconsUrl + "#envelope";
  const toolbarIconUrl = iconsUrl + "#toolbar-icon";

  debug("[HabraUnread] Envelope Icon URL: " + envelopeIconUrl);
  debug("[HabraUnread] Toolbar Icon URL: " + toolbarIconUrl);

  const stylesUrl = await getResourceUrlForceMime("styles", "text/css");

  debug("[HabraUnread] Styles URL: " + stylesUrl);

  function installAdditionalStyles() {
    debug("[HabraUnread] Installing custom styles.");

    const head = document.head || document.getElementsByTagName('head')[0];
    const styleLink = document.createElement('link');

    styleLink.rel = "stylesheet";
    styleLink.type = "text/css";
    styleLink.href = stylesUrl;

    head.appendChild(styleLink);
  }

  function markCommentsUnread(filterFunction) {
    try {
      const commentCounter = $("#xpanel .new");
      const nextUnreadButton = $("#xpanel .next_new");
      const prevUnreadButton = $("#xpanel .prev_new");

      $(".js-comment")
        .filter(filterFunction)
        .addClass("js-comment_new")
        .find(".comment__head")
        .addClass("comment__head_new-comment");

      const commentCount = $(".js-comment.js-comment_new").length;

      const hasComments = (commentCount > 0);

      if (hasComments) {
        commentCounter.text(commentCount);
      }

      commentCounter.toggle(hasComments);
      prevUnreadButton.toggle(hasComments);
      nextUnreadButton.toggle(hasComments);
    } catch(e) {
      debug("[HabraUnread] INTERNAL ERROR: " + e);
    }
  }

  function markAllUnread() {
    markCommentsUnread(function() { return true; });
  }

  function markAsUnread(event) {
    const commentId = parseInt($(this).closest("*[rel]").attr("rel"));

    if (event.ctrlKey) {
      debug("[HabraUnread] Mark all comments newer than current.");

      markCommentsUnread(function() {
        return parseInt($(this).attr("rel")) >= commentId;
      });
    } else {
      debug("[HabraUnread] Mark all comments below this one.");

      let markEverythingBelow = false;

      markCommentsUnread(function() {
        markEverythingBelow ||= (parseInt($(this).attr("rel")) === commentId);
        return markEverythingBelow;
      });
    }
  }

  function createSVGNode(imageUrl, width, height) {
    const unreadImage = document.createElementNS(NS_SVG, "svg");
    unreadImage.setAttribute("width", width);
    unreadImage.setAttribute("height", height);

    const unreadUseTag = document.createElementNS(NS_SVG, "use");
    unreadUseTag.setAttributeNS(NS_XLINK, "href", imageUrl);

    unreadImage.appendChild(unreadUseTag);

    return unreadImage;
  }

  function appendUnreadAllButton() {
    debug("[HabraUnread] Appending \"Mark All Unread\" button.");

    const buttonImage = createSVGNode(toolbarIconUrl, 28, 28);

    const markAllUnreadButton = document.createElement("span");
    markAllUnreadButton.setAttribute("class", "HabraUnread-unread-button");
    markAllUnreadButton.setAttribute("title", "Пометить все комментарии как непрочитанные");
    markAllUnreadButton.addEventListener("click", markAllUnread);

    markAllUnreadButton.appendChild(buttonImage);

    const xpanel = $("div#xpanel");
    xpanel.prepend(markAllUnreadButton);
  }

  function appendUnreadButton(element) {
    debug("[HabraUnread] Adding button to:");
    debug(element);

    const unreadImage = createSVGNode(envelopeIconUrl, 12, 12);

    const unreadAnchor = document.createElement("a");
    unreadAnchor.style = "cursor: pointer;";
    unreadAnchor.title = "Дальше не читал";
    unreadAnchor.addEventListener("click", markAsUnread);

    unreadAnchor.appendChild(unreadImage);

    const unreadListItem = document.createElement("li");
    unreadListItem.setAttribute("class", "inline-list__item inline-list__item_comment-nav");

    unreadListItem.appendChild(unreadAnchor);

    element.appendChild(unreadListItem);
  }

  function mutationObserverCallback(mutationList, observer) {
    debug("[HabraUnread] Comments DOM subtree altered.");

    mutationList.forEach(function(mutation) {
      debug(mutation);
      debug("[HabraUnread] mutation.type: " + mutation.type);
      debug(mutation.addedNodes);

      if (mutation.type === "childList") {
        mutation.addedNodes.forEach(
          function(node) {
            $(node)
              .find("> div.comment > div.comment__head > ul.inline-list_comment-nav")
              .each(function(index, element) {
                appendUnreadButton(element);
              });
          }
        );
      }
    });
  }

  function installMutationObserver() {
    const targetNode = document.getElementById("comments");

    const options = {
      subtree: true,
      childList: true,
      attributes: false,
      attributeOldValue: false,
      characterData: false,
      characterDataOldValue: false
    };

    const observer = new MutationObserver(mutationObserverCallback);
    observer.observe(targetNode, options);
  }

  const hasLoginButton = ($("a#login").length > 0);

  if (hasLoginButton) {
    debug("[HabraUnread] Habrahabr does not support unread comment navigation for anonymous user. Ignoring.");
  } else {
    debug("[HabraUnread] Installing.");

    try {
      installAdditionalStyles();

      appendUnreadAllButton();

      $("ul.inline-list_comment-nav").each(function(index, element) {
        appendUnreadButton(element);
      });

      installMutationObserver();
    } catch(e) {
      debug("[HabraUnread] INTERNAL ERROR: " + e);
    }
  }

})(document);