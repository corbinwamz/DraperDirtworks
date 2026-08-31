(function () {
  "use strict";

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var resumeInput = document.getElementById("app-resume");
  var resumeName = document.getElementById("app-resume-name");

  if (resumeInput && resumeName) {
    resumeInput.addEventListener("change", function () {
      resumeName.textContent = resumeInput.files.length
        ? resumeInput.files[0].name
        : "No file selected (optional)";
    });
  }

  var applicationForm = document.getElementById("application-form");
  var applicationSuccess = document.getElementById("application-success");
  var applicationError = document.getElementById("application-error");

  if (applicationForm && applicationSuccess) {
    applicationForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!applicationForm.reportValidity()) return;

      var submitBtn = applicationForm.querySelector("button[type=submit]");
      var formData = new FormData(applicationForm);

      if (applicationError) applicationError.hidden = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
      }

      fetch("/api/apply", {
        method: "POST",
        body: formData,
      })
        .then(function (response) {
          if (!response.ok) throw new Error("Submission failed");
          applicationForm.hidden = true;
          applicationSuccess.hidden = false;
          applicationSuccess.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch(function () {
          if (applicationError) applicationError.hidden = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Application";
          }
        });
    });
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var contours = document.querySelector(".hero-contours");

  if (contours && !reduceMotion) {
    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          var offset = Math.min(window.scrollY * 0.08, 40);
          contours.style.transform = "translateY(" + offset + "px)";
          ticking = false;
        });
      },
      { passive: true }
    );
  }
})();
