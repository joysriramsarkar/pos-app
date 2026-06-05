const englishToBengali = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};
const convert = (str) => {
  return str.replace(/[0-9]/g, m => englishToBengali[m] || m);
};

const originalDateToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function(locales, options) {
  const res = originalDateToLocaleDateString.call(this, locales, options);
  return convert(res);
};

console.log(new Date('2026-06-05').toLocaleDateString('en-IN'));
