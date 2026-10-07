/* DevelopDrop — the few settings a person might change. */
(function (SS) {
  'use strict';
  SS.config = {
    version: '3.3.1',
    // The project's name and the prefix for saved files. One place, so a rename is one edit.
    name: 'DevelopDrop',
    slug: 'developdrop',
    // Where the "suggest" link sends messages. Leave empty and the link simply isn't shown.
    // Use a dedicated alias, never a personal address.
    suggestEmail: '',
    // Where the roadmap lives (shown in the help card). Filled in when the site is published.
    repoUrl: 'https://github.com/DreDarkroom/DevelopDrop',
    // Where the feedback card sends an answer: a private notification channel (ntfy). Empty = the card never appears.
    feedbackUrl: 'https://ntfy.sh/developdrop-fb-c3br1njqktulddkr5c5e58',
    // GoatCounter site code for an anonymous page-view count (no cookies, no IP address stored). Empty = no counting. Leave empty until the owner has made the account.
    counterCode: '',
  };
})((window.SS = window.SS || { events: [] }));
