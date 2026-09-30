(function (SS) {
  'use strict';
  SS.seq.load(); // a loop saved with "keep" comes back before the controls are built
  SS.visual.init();
  SS.ui.init();
})(window.SS);
