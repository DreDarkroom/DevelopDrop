/* DevelopDrop — the few settings a person might change. */
(function (SS) {
  'use strict';
  SS.config = {
    version: '3.0.0',
    // The project's name and the prefix for saved files. One place, so a rename is one edit.
    name: 'DevelopDrop',
    slug: 'developdrop',
    // Where the "suggest" link sends messages. Leave empty and the link simply isn't shown.
    // Use a dedicated alias, never a personal address.
    suggestEmail: '',
    // Where the roadmap lives (shown in the help card). Filled in when the site is published.
    repoUrl: 'https://github.com/DreDarkroom/squidgysqueegee',
  };
})((window.SS = window.SS || { events: [] }));
