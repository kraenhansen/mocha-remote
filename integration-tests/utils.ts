const timingsPattern = /\d+ms/g;

export const removeTimings = (text: string) => {
  return text.replace(timingsPattern, "(?ms)");
};
