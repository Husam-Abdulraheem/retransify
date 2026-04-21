module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100], // زيادة الحد لعنوان الكوميت إلى 100 حرف
    'body-max-line-length': [2, 'always', 200], // زيادة حد طول أسطر الوصف
  },
};
