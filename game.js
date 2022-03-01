// Default sizes. Will be updated dynamically in the |draw| method.
// All sizes are in pixels by default.
var TILE_SIZE = 100;

var grid;
var pathManager;
var ctx;
var storageManager;

// "Tile time" is measured in ticks. Each tick happens when a new tile is
// generated. I've set a minimum tick interval for each arithmetic op tile
// to avoid having them show up too frequently (by utilizing the |lastgen|
// variable).
// Note that this is unrelated to any timer shown to the user.
var tick = 0;
var lastGen = {
	"ADD": 0,
	"MULTIPLIER": 0,
	"SQUARE": 0
};

var animationRunning = false;

// Game control
var enabled = false;
var timeLeft = 0;
var timerId;
var currentPoints = 0;

// User setting
var use_click_highlighting = true;
var enable_arithmetic_tiles = false;

const TIME_LIMIT_SEC = 60;
const TIME_WARNING_THRESHOLD = 10;
const TILE_VANISH_RATE = 10;	// Tile dimension reduces by 10px per frame
const TILE_DROP_RATE = 30;	// Tile drops 30px per frame

const TILE_BG_COL = '#fefefe';
const TILE_HIGHLIGHT_COL = '#e7e7e7';
const TILE_TEXT_COL = '#666666';
const MULTIPLIER_TILE_BG_COL = "#e07a5f";
const SQUARE_TILE_BG_COL = "#be6f7f";
const GRID_X_PADDING = 20;	// 20px padding on each side of grid
const TILE_TEXT_SIZE = 20;	// 20px font size
const TILE_NUMBER_LIMIT = 9;	// Tiles will have numbers in range [-TILE_NUMBER_LIMIT, TILE_NUMBER_LIMIT]
const GRID_SIZE = 5;

class StorageManager {
	constructor() {
		try {
			this.bestScoreStorage = window.localStorage;
		} catch (e) {
			this.bestScoreStorage = null;
			console.log("Could not access local storage. Error = " + e);
		}
	}

	maybeUpdateBestScore(s) {
		if (this.bestScoreStorage == null) {
			return true;
		}

		let bestScore = this.bestScoreStorage.getItem("best-score");
		if ((bestScore === null && s > 0) || (bestScore !== null && parseInt(bestScore) < s)) {
			try {
				this.bestScoreStorage.setItem("best-score", s + "");
			} catch (e) {
				console.log("Could not save new best score. Error = " + e);
			}
			return true;
		}
		return false;
	}

	getBestScore() {
		if (this.bestScoreStorage == null) {
			return 0;
		}
		let bestScore = this.bestScoreStorage.getItem("best-score");
		return bestScore === null ? 0 : parseInt(bestScore);
	}
}

// Manages current path state and path sum. Does not deal with UI.
class PathManager {
	constructor() {
		this.inPathBool = false;
		this.currentPath = [];
		this.currentSum = 0;
	}

	// Only adds the |coords| to the path if they haven't been added before and are
	// adjacent to an existing tile in the path.
	maybeAddToPath(coords) {
		if (!coords) {
			return false;
		}
		for (const t of this.currentPath) {
			if (t.row === coords.row && t.col === coords.col) {
				return false;
			}
		}

		if (this.currentPath.length === 0) {
			this.currentPath.push(coords);
			this.currentSum = grid.grid[coords.col][coords.row].applyOp(this.currentSum);
			return true;
		} else {
			for (const t of this.currentPath) {
				if ((t.row === coords.row && t.col === coords.col + 1) ||
					(t.row === coords.row && t.col === coords.col - 1) ||
					(t.row - 1 === coords.row && t.col === coords.col) ||
					(t.row + 1 === coords.row && t.col === coords.col)) {
					this.currentPath.push(coords);
					this.currentSum = grid.grid[coords.col][coords.row].applyOp(this.currentSum);
					return true;
				}
			}
		}
		return false;
	}

	resetPath() {
		this.inPathBool = false;
		this.currentPath = [];
		this.currentSum = 0;
	}

	inPath() {
		return this.inPathBool;
	}

	setInPath(b) {
		this.inPathBool = b;
	}

	getCurrentPath() {
		return this.currentPath;
	}

	getCurrentPathLength() {
		return this.currentPath.length;
	}

	getCurrentSum() {
		return this.currentSum;
	}
}

class AdderTile {
	// cx and cy store the coordinates of the center of the tile.
	constructor(cx, cy, val) {
		this.cx = cx;
		this.cy = cy;
		this.val = val;
		this.highlight = false;

		// Used to store the distance to move downward during a translation
		// animation.
		this.drop = 0;

		// Used to store the tile size during a vanish animation.
		this.tileSize = TILE_SIZE;
		this.showText = true;
	}

	render(ctx) {
		ctx.fillStyle = this.highlight ? TILE_HIGHLIGHT_COL : TILE_BG_COL;
		ctx.fillRect(this.cx - this.tileSize / 2, this.cy - this.tileSize /
			2,
			this.tileSize, this.tileSize);
		if (this.showText) {
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = TILE_TEXT_SIZE + 'px sans-serif';
			ctx.fillStyle = TILE_TEXT_COL;
			ctx.fillText(this.val, this.cx, this.cy);
		}
	}

	applyOp(x) {
		return x + this.val;
	}

	getType() {
		return "ADD";
	}
}

class MultiplierTile {
	constructor(cx, cy, multiplier) {
		this.cx = cx;
		this.cy = cy;
		this.multiplier = multiplier;
		this.highlight = false;
		this.drop = 0;
		this.tileSize = TILE_SIZE;
		this.showText = true;
	}

	render(ctx) {
		ctx.fillStyle = this.highlight ? TILE_HIGHLIGHT_COL : TILE_BG_COL;
		ctx.fillRect(this.cx - this.tileSize / 2, this.cy - this.tileSize /
			2,
			this.tileSize, this.tileSize);
		ctx.fillStyle = MULTIPLIER_TILE_BG_COL;
		ctx.fillRect(this.cx - this.tileSize / 4, this.cy - this.tileSize /
			4,
			this.tileSize / 2, this.tileSize / 2);
		if (this.showText) {
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = TILE_TEXT_SIZE + 'px sans-serif';
			ctx.fillStyle = TILE_BG_COL;
			if (this.multiplier === -1) {
				ctx.fillText("-x", this.cx, this.cy);
			} else {
				ctx.fillText("×" + this.multiplier, this.cx, this.cy);
			}
		}
	}

	applyOp(x) {
		return x * this.multiplier;
	}

	getType() {
		return "MULTIPLIER";
	}
}

class SquareTile {
	constructor(cx, cy) {
		this.cx = cx;
		this.cy = cy;
		this.highlight = false;
		this.drop = 0;
		this.tileSize = TILE_SIZE;
		this.showText = true;
	}

	render(ctx) {
		ctx.fillStyle = this.highlight ? TILE_HIGHLIGHT_COL : TILE_BG_COL;
		ctx.fillRect(this.cx - this.tileSize / 2, this.cy - this.tileSize /
			2,
			this.tileSize, this.tileSize);
		ctx.fillStyle = SQUARE_TILE_BG_COL;
		ctx.fillRect(this.cx - this.tileSize / 4, this.cy - this.tileSize /
			4,
			this.tileSize / 2, this.tileSize / 2);
		if (this.showText) {
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = TILE_TEXT_SIZE + 'px sans-serif';
			ctx.fillStyle = TILE_BG_COL;
			ctx.fillText("x²", this.cx, this.cy);
		}
	}

	applyOp(x) {
		return x * x;
	}

	getType() {
		return "SQUARE";
	}
}

class TileGrid {
	constructor(x, y) {
		this.grid = new Array(GRID_SIZE);
		this.x = x;
		this.y = y;
		for (let i = 0; i < GRID_SIZE; i++) {
			this.grid[i] = new Array(GRID_SIZE);
		}
	}

	init() {
		// The grid is stored in column major format for now in order to
		// maintain equivalence: x, y <=> col, row.
		for (let col = 0; col < GRID_SIZE; col++) {
			for (let row = 0; row < GRID_SIZE; row++) {
				this.grid[col][row] = generateTile(
					this.x + col * TILE_SIZE + TILE_SIZE / 2,
					this.y + row * TILE_SIZE + TILE_SIZE / 2
				);
			}
		}
	}

	render(ctx) {
		ctx.fillStyle = TILE_BG_COL;
		ctx.fillRect(0, 0, TILE_SIZE * GRID_SIZE, TILE_SIZE * GRID_SIZE);
		for (let col = 0; col < GRID_SIZE; col++) {
			for (let row = 0; row < GRID_SIZE; row++) {
				this.grid[col][row].render(ctx);
			}
		}
	}

	// (x, y) must be relative to the grid and not to the window.
	getTileForPoint(x, y) {
		for (let col = 0; col < GRID_SIZE; col++) {
			for (let row = 0; row < GRID_SIZE; row++) {
				let t = this.grid[col][row];
				if (Math.abs(x - t.cx) <= t.tileSize / 2 && Math.abs(y - t
						.cy) <= t.tileSize / 2) {
					return {
						'col': col,
						'row': row
					};
				}
			}
		}
	}

	highlightTile(ctx, col, row) {
		this.grid[col][row].highlight = true;
		this.grid[col][row].render(ctx);
	}

	clearHighlights(ctx) {
		for (let col = 0; col < GRID_SIZE; col++) {
			for (let row = 0; row < GRID_SIZE; row++) {
				this.grid[col][row].highlight = false;
				this.grid[col][row].render(ctx);
			}
		}
	}
}

function getRandomIntInclusive(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateCurrentPathSumText() {
	let sum_value = document.getElementById("sum-value");
	if (pathManager.getCurrentPathLength() > 0) {
		sum_value.textContent = pathManager.getCurrentSum();
	} else {
		// Treat an empty path as having no sum as opposed to a "zero" sum
		sum_value.textContent = "";
	}
}


function vanishFrame() {
	animationRunning = true;
	// ================================================================
	// 1. First we vanish all the highlighted tiles with a "collapse"
	// animation.
	// ================================================================
	let allVanishesDone = true;
	for (const coord of pathManager.getCurrentPath()) {
		if (grid.grid[coord.col][coord.row].tileSize > 0) {
			allVanishesDone = false;
			grid.grid[coord.col][coord.row].showText = false;
			// TILE_VANISH_RATE may not be a divisor of the tile size.
			if (grid.grid[coord.col][coord.row].tileSize < TILE_VANISH_RATE) {
				grid.grid[coord.col][coord.row].tileSize = 0;
			} else {
				grid.grid[coord.col][coord.row].tileSize -= TILE_VANISH_RATE;
			}
		}
	}
	if (!allVanishesDone) {
		grid.render(ctx);
		requestAnimationFrame(vanishFrame);
	} else {
		pathManager.resetPath();

		// We update the sum text here since the path has been cleared
		// and so the currentSum being zero will be treated differently.
		updateCurrentPathSumText();

		// =========================================================
		// 2. Second, we translate all the tiles that were affected
		// by the removal of the tiles in the first step, downwards.
		// =========================================================

		// Calculate how much each non-highlighted tile needs to move down
		// and store it in its |drop| attr.
		let newTilesPerCol = [];
		for (let col = 0; col < GRID_SIZE; col++) {
			newTilesPerCol.push(0);
			// Move from bottom to top keeping track of the number
			// of highlighted tiles seen so far. This will be the
			// number of spots each tile needs to move down.
			for (let row = GRID_SIZE - 1; row >= 0; row--) {
				if (grid.grid[col][row].highlight) {
					newTilesPerCol[col]++;
					delete grid.grid[col][row];
				} else {
					let drop = newTilesPerCol[col];
					grid.grid[col][row].drop = drop * TILE_SIZE;
					// Reassign the current tile to its post
					// animation (col, row) in the grid.
					grid.grid[col][row + drop] = grid.grid[col][row];
				}
			}
		}
		// Create new tiles in the negative space above the canvas that will
		// drop down to make up for the vanishing tiles.
		for (let col = 0; col < GRID_SIZE; col++) {
			for (let negRow = 0; negRow < newTilesPerCol[col]; negRow++) {
				let t = generateTile(
					grid.x + col * TILE_SIZE + TILE_SIZE / 2,
					grid.y - (negRow + 1) * TILE_SIZE + TILE_SIZE / 2);
				t.drop = newTilesPerCol[col] * TILE_SIZE;
				// Assign the new tile to its post animation
				// (col, row) in the grid.
				grid.grid[col][newTilesPerCol[col] - negRow - 1] = t;
			}
		}

		// Translation animation loop. Each tile t moves t.drop * TILE_SIZE
		// downwards.
		translateFrame();
	}
}

function translateFrame() {
	let allTranslatesDone = true;
	for (let col = 0; col < GRID_SIZE; col++) {
		for (let row = 0; row < GRID_SIZE; row++) {
			if (grid.grid[col][row].drop > 0) {
				allTranslatesDone = false;
				// TILE_DROP_RATE may not always be a divisor of the distance
				// any tile needs to move.
				if (grid.grid[col][row].drop > TILE_DROP_RATE) {
					grid.grid[col][row].drop -= TILE_DROP_RATE;
					grid.grid[col][row].cy += TILE_DROP_RATE;
				} else {
					grid.grid[col][row].cy += grid.grid[col][row].drop;
					grid.grid[col][row].drop = 0;
				}
			}
		}
	}
	if (!allTranslatesDone) {
		grid.render(ctx);
		requestAnimationFrame(translateFrame);
	} else {
		animationRunning = false;
	}
}

// Generates various types of tiles based on certain probabilities while
// also accounting for the frequency of each type of tile on the grid and
// when it was last generated.
function generateTile(cx, cy) {
	tick++;
	let numPositive = 0;
	let numNegative = 0;
	let numMultiplier = 0;
	let numSquare = 0;
	for (let col = 0; col < GRID_SIZE; col++) {
		for (let row = 0; row < GRID_SIZE; row++) {
			if (grid.grid[col][row] === undefined) {
				// Will happen during grid initialization.
				continue;
			}
			switch (grid.grid[col][row].getType()) {
				case "ADD":
					if (grid.grid[col][row].val > 0) {
						numPositive++;
					} else {
						numNegative++;
					}
					break;
				case "MULTIPLIER":
					numMultiplier++;
					break;
				case "SQUARE":
					numSquare++;
					break;
			}
		}
	}

	let r = Math.random();
	if (enable_arithmetic_tiles && r > 0.9) {
		// 2 MULTIPLIER
		if ((tick - lastGen.MULTIPLIER > 10) && numMultiplier < 1) {
			lastGen.MULTIPLIER = tick;
			return new MultiplierTile(cx, cy, 2);
		}
	} else if (enable_arithmetic_tiles && r > 0.8) {
		// -1 MULTIPLIER
		if ((tick - lastGen.MULTIPLIER > 10) && numMultiplier < 1) {
			lastGen.MULTIPLIER = tick;
			return new MultiplierTile(cx, cy, -1);
		}
	} else if (enable_arithmetic_tiles && r > 0.7) {
		// SQUARE
		if ((tick - lastGen.SQUARE > 10) && numSquare < 1) {
			lastGen.SQUARE = tick;
			return new SquareTile(cx, cy);
		}
	}

	// ADD (default)
	// Don't let the ratio of positive to negative numbers skew too much in
	// either direction.
	if (numPositive - numNegative > 5) {
		return new AdderTile(cx, cy, getRandomIntInclusive(-TILE_NUMBER_LIMIT, 0));
	} else if (numNegative - numPositive > 5) {
		return new AdderTile(cx, cy, getRandomIntInclusive(0, TILE_NUMBER_LIMIT));
	} else {
		return new AdderTile(cx, cy, getRandomIntInclusive(-TILE_NUMBER_LIMIT, TILE_NUMBER_LIMIT));
	}
}

// Causes a tile to fidget horizontally.
function fidget(coords, ctx) {
	animationRunning = true;
	let t = grid.grid[coords.col][coords.row];

	// Keeps track of which tile will fidget.
	grid.fidgetCoords = coords;
	grid.fidgetOrigX = t.cx;
	grid.fidgetStartTime = Date.now();

	// Keeps track of whether the tile just moved left or right.
	grid.fidgetToggle = true;

	fidgetFrame();
}

function fidgetFrame() {
	let now = Date.now();
	let coords = grid.fidgetCoords;
	if (now - grid.fidgetStartTime > 150) {
		// Reset tile before returning
		grid.grid[coords.col][coords.row].cx = grid.fidgetOrigX;
		grid.render(ctx);
		animationRunning = false;
		return;
	}
	if (grid.fidgetToggle) {
		grid.grid[coords.col][coords.row].cx += 5;
	} else {
		grid.grid[coords.col][coords.row].cx -= 5;
	}
	grid.render(ctx);
	grid.fidgetToggle = !grid.fidgetToggle;
	requestAnimationFrame(fidgetFrame);
}

function startTimer() {
	document.getElementById("timer-value").textContent = timeLeft;
	timerId = setInterval(function() {
		timeLeft--;
		document.getElementById("timer-value").textContent =
			timeLeft;
		if (timeLeft <= 0) {
			clearInterval(timerId);
			gameOver();
		}
		if (timeLeft === TIME_WARNING_THRESHOLD) {
			// Alert the player that time's almost up
			document.getElementById("timer-view").classList.add("timer-warning");
			document.getElementById("timer-label").classList.add("timer-warning");
			document.getElementById("timer-value").classList.add("timer-warning");
		}
	}, 1000);
}

function clearOverlays() {
	for (let elem of document.getElementsByClassName("overlay")) {
		elem.style.display = "none";
	}
}

function showOverlay(overlay_name) {
	// Use flex for vertically aligning content in the center.
	// For the welcome and settings overlays, we will keep content aligned to
	// the top.
	if (overlay_name == "SETTINGS") {
		document.getElementById("settings-overlay").style.display = "block";
		return;
	}
	if (overlay_name == "WELCOME") {
		clearOverlays();
		document.getElementById("welcome-overlay").style.display = "block";
		return;
	}
	if (overlay_name == "PAUSE") {
		document.getElementById("pause-overlay").style.display = "flex";
		return;
	}
	if (overlay_name == "GAME_OVER") {
		document.getElementById("game-over-overlay").style.display = "flex";
		return;
	}
}

function pauseGame() {
	enabled = false;
	// Pause timer.
	clearInterval(timerId);
	// Show the pause overlay.
	showOverlay("PAUSE");
}

function resumeGame() {
	clearOverlays();
	startTimer();
	enabled = true;
}

function startGame() {
	currentPoints = 0;
	updatePoints();
	enabled = true;
	// Hide all overlays
	clearOverlays();
	document.getElementById("timer-view").classList.remove("timer-warning");
	document.getElementById("timer-label").classList.remove("timer-warning");
	document.getElementById("timer-value").classList.remove("timer-warning");
	startTimer();
}

function gameOver() {
	if (!animationRunning) {
		grid.clearHighlights(ctx);
		pathManager.resetPath();
		updateCurrentPathSumText();
	}
	enabled = false;
	showOverlay("GAME_OVER");
	document.getElementById("game-over-score").textContent = currentPoints;

	if (storageManager.maybeUpdateBestScore(currentPoints)) {
		document.getElementById("game-over-high-score-banner").style.display = "block";
	} else {
		document.getElementById("game-over-high-score-banner").style.display = "none";
	}
	document.getElementById("game-over-best-score").textContent = storageManager.getBestScore();
}

function updatePoints() {
	currentPoints += pathManager.getCurrentPathLength() * pathManager.getCurrentPathLength();
	document.getElementById("points-value").textContent = currentPoints;
}

// (x, y) are the click/touch coordinates w.r.t the canvas (and not w.r.t
// the screen)
function handlePathStart(x, y) {
	if (!enabled) {
		return;
	}
	if (!pathManager.inPath()) {
		pathManager.setInPath(true);
		if (animationRunning) {
			return;
		}
		let coords = grid.getTileForPoint(x, y);
		if (coords == null) {
			return;
		}
		if (pathManager.getCurrentPathLength() === 0 &&
			grid.grid[coords.col][coords.row].getType() != "ADD") {
			// Prevent arithmetic op tiles from being the first in the path.
			grid.clearHighlights(ctx);
			fidget(coords);
		} else if (pathManager.maybeAddToPath(coords)) {
			updateCurrentPathSumText();
			grid.highlightTile(ctx, coords.col, coords.row);
		}
	}
}

// (x, y) are the click/touch coordinates w.r.t the canvas (and not w.r.t
// the screen)
function handlePathMove(x, y) {
	if (!enabled) {
		return;
	}
	if (pathManager.inPath()) {
		if (animationRunning) {
			return;
		}
		let coords = grid.getTileForPoint(x, y);
		if (coords == null) {
			return;
		}
		if (pathManager.getCurrentPathLength() === 0 &&
			grid.grid[coords.col][coords.row].getType() != "ADD") {
			// Prevent arithmetic op tiles from being the first in the path.
			grid.clearHighlights(ctx);
			fidget(coords);
		} else if (pathManager.maybeAddToPath(coords)) {
			updateCurrentPathSumText();
			grid.highlightTile(ctx, coords.col, coords.row);
		}
	}
}

function addListenersForDragBasedHighlighting(rect, canvas, document) {
	canvas.addEventListener("mousedown", function(e) {
		if (use_click_highlighting) {
			return;
		}
		return handlePathStart(e.clientX - rect.left, e.clientY - rect.top);
	});
	canvas.addEventListener("touchstart", function(e) {
		if (use_click_highlighting) {
			return;
		}
		return handlePathStart(e.touches[0].clientX - rect.left, e
			.touches[0].clientY - rect.top);
	});
	canvas.addEventListener("mousemove", function(e) {
		if (use_click_highlighting) {
			return;
		}
		return handlePathMove(e.clientX - rect.left, e.clientY - rect
			.top);
	});
	canvas.addEventListener("touchmove", function(e) {
		if (use_click_highlighting) {
			return;
		}
		return handlePathMove(e.touches[0].clientX - rect.left, e
			.touches[0].clientY - rect.top);
	});

	["mouseup", "touchend", "touchcancel"].forEach(function(ev) {
		document.addEventListener(ev, function(e) {
			if (use_click_highlighting) {
				return;
			}
			if (!enabled) {
				return;
			}
			if (pathManager.inPath()) {
				pathManager.setInPath(false);
				if (animationRunning) {
					return;
				}
				if (pathManager.getCurrentSum() == 0) {
					updatePoints();
					vanishFrame();
				} else {
					grid.clearHighlights(ctx);
					pathManager.resetPath();
					updateCurrentPathSumText();
				}
			}
		});
	});
}

function addListenersForClickBasedHighlighting(rect, canvas, document) {
	canvas.addEventListener("mousedown", function(e) {
		if (!use_click_highlighting) {
			return;
		}
		if (!pathManager.inPath()) {
			handlePathStart(e.clientX - rect.left, e.clientY - rect.top);
			pathManager.setInPath(true);
		} else {
			handlePathMove(e.clientX - rect.left, e.clientY - rect.top);
		}
		if (pathManager.getCurrentSum() == 0) {
			pathManager.setInPath(false);
			updatePoints();
			vanishFrame();
		}
	});
	document.addEventListener("mousedown", function(e) {
		if (!use_click_highlighting) {
			return;
		}
		if (!canvas.contains(e.target)) {
			pathManager.resetPath();
			grid.clearHighlights(ctx);
			updateCurrentPathSumText();
		}
	});
}

function draw() {

	// Compute game width based on screen size.
	// Source: https://stackoverflow.com/a/28241682.
	var screenWidth = window.innerWidth ||
		document.documentElement.clientWidth ||
		document.body.clientWidth;

	if (screenWidth > 500) {
		TILE_SIZE = 100;
	} else if (screenWidth > 100) {
		TILE_SIZE = (screenWidth - 2 * GRID_X_PADDING) / GRID_SIZE;
	} else {
		TILE_SIZE = 50;
	}
	document.getElementById("canvas-container").style.width = TILE_SIZE *
		GRID_SIZE + 'px';
	document.getElementById("container").style.width = TILE_SIZE * GRID_SIZE +
		'px';

	let canvas = document.getElementById("tutorial");

	// Handle retina displays with non-unit pixel ratios
	let dpr = window.devicePixelRatio || 1;
	let canvasDimCss = GRID_SIZE * TILE_SIZE;
	canvas.width = canvasDimCss * dpr;
	canvas.height = canvasDimCss * dpr;
	canvas.style.width = canvasDimCss + "px";
	canvas.style.height = canvasDimCss + "px";
	ctx = canvas.getContext("2d");
	ctx.scale(dpr, dpr);

	let rect = canvas.getBoundingClientRect();

	ctx.fillStyle = TILE_BG_COL;
	ctx.fillRect(0, 0, canvasDimCss, canvasDimCss);

	grid = new TileGrid(0, 0);
	grid.init();
	grid.render(ctx);

	pathManager = new PathManager();
	storageManager = new StorageManager();

	// Add listeners for both. Only one will work based on the use_click_highlighting
	// user setting variable.
	addListenersForDragBasedHighlighting(rect, canvas, document);
	addListenersForClickBasedHighlighting(rect, canvas, document);

	document.getElementById("start-game-btn").addEventListener('click',
		startGame);
	document.getElementById("play-again-btn").addEventListener('click',
		function() {
			if (!animationRunning) {
				timeLeft = TIME_LIMIT_SEC;
				// Reset grid before restarting.
				grid.init();
				grid.render(ctx);
				startGame();
			}
		});
	document.getElementById("pause-game-btn").addEventListener('click', pauseGame);
	for (let elem of document.getElementsByClassName("resume-game-btn")) {
		elem.addEventListener('click', resumeGame);
	}
	for (let elem of document.getElementsByClassName("quit-game-btn")) {
		elem.addEventListener('click', function() {
			enabled = false;
			if (!animationRunning) {
				// Reset timer, path, points
				timeLeft = TIME_LIMIT_SEC;
				document.getElementById("timer-view").classList.remove("timer-warning");
				document.getElementById("timer-label").classList.remove("timer-warning");
				document.getElementById("timer-value").classList.remove("timer-warning");
				document.getElementById("timer-value").textContent = timeLeft;
				grid.init();
				grid.render(ctx);
				pathManager.resetPath();
				updateCurrentPathSumText();
				updatePoints();
				// Show the welcome overlay
				showOverlay("WELCOME");
			}
		});
	}
	document.getElementById("settings-btn").addEventListener('click',
		function() {
			// Show only the settings overlay.
			showOverlay("SETTINGS");

			// Update the UI based on the setting variable we have.
			if (use_click_highlighting) {
				document.getElementById("settings-click").checked = true;
			} else {
				document.getElementById("settings-gesture").checked = true;
			}
			if (enable_arithmetic_tiles) {
				document.getElementById("settings-arithmetic-tiles").checked = true;
			} else {
				document.getElementById("settings-arithmetic-tiles").checked = false;
			}
		});
	document.getElementById("close-settings-btn").addEventListener('click',
		function() {
			// Close only the settings overlay.
			document.getElementById("settings-overlay").style.display = "none";

			// Save the settings.
			for (let elem of document.getElementsByName("settings-highlight-method")) {
				if (elem.checked) {
					if (elem.value == "click") {
						use_click_highlighting = true;
					} else if (elem.value == "gesture") {
						use_click_highlighting = false;
					}
				}
			}
			if (document.getElementById("settings-arithmetic-tiles").checked) {
				enable_arithmetic_tiles = true;
			} else {
				enable_arithmetic_tiles = false;
			}
		});

	timeLeft = TIME_LIMIT_SEC;

	// Show the welcome overlay.
	showOverlay("WELCOME");
}
