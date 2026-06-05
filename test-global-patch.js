const englishToBengali = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};
const convert = (str) => {
  return str.replace(/[0-9]/g, m => englishToBengali[m] || m);
};

const originalIntlNumberFormat = Intl.NumberFormat;
Intl.NumberFormat = function(locales, options) {
  const formatter = new originalIntlNumberFormat(locales, options);
  
  const originalFormat = formatter.format;
  Object.defineProperty(formatter, 'format', {
    get: function() {
      return function(value) {
        const res = originalFormat.call(formatter, value);
        return convert(res);
      };
    }
  });
  
  return formatter;
}
Intl.NumberFormat.prototype = originalIntlNumberFormat.prototype;

console.log(new Intl.NumberFormat('en-IN').format(1234));
