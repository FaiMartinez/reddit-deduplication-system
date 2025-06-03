// Initialize ScrollReveal

// Scroll reveal animations
const scrollRevealOption = {
  distance: "50px",
  origin: "bottom",
  duration: 1000,
};

// Hero section animations
ScrollReveal().reveal(".container__left h1", scrollRevealOption);
ScrollReveal().reveal(".container__left .container__btn", {
  ...scrollRevealOption,
  delay: 500,
});

// Feature section animations
ScrollReveal().reveal(".container__right h2", {
  ...scrollRevealOption,
  delay: 1000,
});
ScrollReveal().reveal(".container__right h3", {
  ...scrollRevealOption,
  delay: 1500,
});
ScrollReveal().reveal(".container__right p", {
  ...scrollRevealOption,
  delay: 2000,
});

// Image animations
ScrollReveal().reveal(".container__right .tent-1", {
  duration: 1000,
  delay: 2500,
});
ScrollReveal().reveal(".container__right .tent-2", {
  duration: 1000,
  delay: 3000,
});
