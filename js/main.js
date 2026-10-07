(function (SS) {
  'use strict';
  SS.seq.load(); // a loop saved with "keep" comes back before the controls are built
  SS.visual.init();
  SS.ui.init();
  SS.feedback.startCounter();                      // off until config.counterCode is filled in
  const fb = new URLSearchParams(location.search).get('feedback');
  SS.feedback.start({ mode: fb === 'test' ? 'test' : fb === '1' ? 'force' : 'live' });
})(window.SS);
