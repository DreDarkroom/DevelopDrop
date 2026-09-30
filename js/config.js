/* SquidgySqueegee — the few settings a person might change. */
(function (SS) {
  'use strict';
  SS.config = {
    version: '2.0.0',
    // Where the "suggest" link sends messages. Leave empty and the link simply isn't shown.
    // Use a dedicated alias, never a personal address.
    suggestEmail: '',
    // Where the roadmap lives (shown in the help card). Filled in when the site is published.
    repoUrl: '',
  };
})((window.SS = window.SS || { events: [] }));
