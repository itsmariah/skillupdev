document.addEventListener("DOMContentLoaded", () => {

const navbar = document.querySelector(".navbar");

if (!navbar) return;

window.addEventListener("scroll", () => {

if (window.scrollY > 50) {
navbar.classList.add("navbar-scrolled");
} else {
navbar.classList.remove("navbar-scrolled");
}

});

});

/* CODE PARTICLES BACKGROUND */

document.addEventListener("DOMContentLoaded", () => {

const container = document.getElementById("code-particles");

const symbols = [
"{ }",
"< >",
"</>",
"( )",
"[ ]",
"==",
"!=",
"&&",
"||",
"=>"
];

for(let i = 0; i < 40; i++){

const span = document.createElement("span");

span.classList.add("code-symbol");

span.innerText = symbols[Math.floor(Math.random()*symbols.length)];

span.style.left = Math.random()*100 + "vw";

span.style.animationDuration = (10 + Math.random()*20) + "s";

span.style.fontSize = (18 + Math.random()*20) + "px";

container.appendChild(span);

}

});