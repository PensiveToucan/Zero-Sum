/* TODO: Make everything IE compatible */

var TILE_SIZE = 100;
var GRID_SIZE = 5;

var TILE_BG_COL = '#fefefe';
var TILE_HIGHLIGHT_COL = '#e7e7e7';
var TILE_TEXT_COL = '#666666';
var MULTIPLIER_TILE_BG_COL = "#e07a5f";
var SQUARE_TILE_BG_COL = "#be6f7f";

var inPath = false;
var currentPath = [];
var currentSum = 0;
var grid;
var ctx;

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

class Tile {
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
			ctx.font = '20px sans-serif';
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
			ctx.font = '20px sans-serif';
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
			ctx.font = '20px sans-serif';
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
		ctx.fillRect(0, 0, 500, 500);
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
	if (currentPath.length > 0) {
		sum_value.textContent = currentSum;
	} else {
		// Treat an empty path as having no sum as opposed to a "zero" sum
		sum_value.textContent = "";
	}
}

// Only adds the |coords| to the path if they haven't been added before and are
// adjacent to an existing tile in the path.
function maybeAddToPath(coords) {
	if (!coords) {
		return false;
	}
	for (const t of currentPath) {
		if (t.row === coords.row && t.col === coords.col) {
			return false;
		}
	}

	if (currentPath.length === 0) {
		currentPath.push(coords);
		currentSum = grid.grid[coords.col][coords.row].applyOp(currentSum);
		updateCurrentPathSumText();
		return true;
	} else {
		for (const t of currentPath) {
			if ((t.row === coords.row && t.col === coords.col + 1) ||
				(t.row === coords.row && t.col === coords.col - 1) ||
				(t.row - 1 === coords.row && t.col === coords.col) ||
				(t.row + 1 === coords.row && t.col === coords.col)) {
				currentPath.push(coords);
				currentSum = grid.grid[coords.col][coords.row].applyOp(
					currentSum);
				updateCurrentPathSumText();
				return true;
			}
		}
	}
	return false;
}

function vanishFrame() {
	animationRunning = true;
	// ================================================================
	// 1. First we vanish all the highlighted tiles with a "collapse"
	// animation.
	// ================================================================
	let allVanishesDone = true;
	for (const coord of currentPath) {
		if (grid.grid[coord.col][coord.row].tileSize > 0) {
			allVanishesDone = false;
			grid.grid[coord.col][coord.row].showText = false;
			// 10 is a divisor of the tile size so |tileSize| will evenly
			// reach zero eventually.
			grid.grid[coord.col][coord.row].tileSize -= 10;
		} else {
			grid.grid[coord.col][coord.row] = undefined;
		}
	}
	if (!allVanishesDone) {
		grid.render(ctx);
		requestAnimationFrame(vanishFrame);
	} else {
		currentPath = [];

		// We update the sum text here since the path has been cleared
		// and so the currentSum being zero will be treated differently.
		currentSum = 0;
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
				if (grid.grid[col][row] === undefined) {
					newTilesPerCol[col]++;
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
				// 10 is always a divisor of the distance
				// any tile needs to move so |drop| will
				// evenly reach zero eventually.
				grid.grid[col][row].drop -= 10;
				grid.grid[col][row].cy += 10;
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
	if (r > 0.9) {
		// 2 MULTIPLIER
		if ((tick - lastGen.MULTIPLIER > 10) && numMultiplier < 1) {
			lastGen.MULTIPLIER = tick;
			return new MultiplierTile(cx, cy, 2);
		}
	} else if (r > 0.8) {
		// -1 MULTIPLIER
		if ((tick - lastGen.MULTIPLIER > 10) && numMultiplier < 1) {
			lastGen.MULTIPLIER = tick;
			return new MultiplierTile(cx, cy, -1);
		}
	} else if (r > 0.7) {
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
		return new Tile(cx, cy, getRandomIntInclusive(-9, 0));
	} else if (numNegative - numPositive > 5) {
		return new Tile(cx, cy, getRandomIntInclusive(0, 9));
	} else {
		return new Tile(cx, cy, getRandomIntInclusive(-9, 9));
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
		grid.grid[coords.col][coords.row].cx += 3;
	} else {
		grid.grid[coords.col][coords.row].cx -= 3;
	}
	grid.render(ctx);
	grid.fidgetToggle = !grid.fidgetToggle;
	requestAnimationFrame(fidgetFrame);
}

function startTimer() {
	timeLeft = 5;
	document.getElementById("timer-value").textContent = timeLeft;
	timerId = setInterval(function() {
		if (timeLeft <= 0) {
			clearInterval(timerId);
			gameOver();
		} else {
			timeLeft--;
			document.getElementById("timer-value").textContent =
				timeLeft;
		}
	}, 1000);
}

function startGame() {
	enabled = true;
	for (let elem of document.getElementsByClassName("overlay")) {
		elem.style.display = "none";
	}
	startTimer();
}

function gameOver() {
	grid.clearHighlights(ctx);
	currentPath = [];
	updateCurrentPathSumText();
	enabled = false;
	document.getElementById("game-over-overlay").style.display = "block";
}

function updatePoints() {
	currentPoints += currentPath.length * currentPath.length;
	document.getElementById("points-value").textContent = currentPoints;
}

function draw() {
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
	ctx.fillRect(0, 0, 500, 500);

	grid = new TileGrid(0, 0);
	grid.init();
	grid.render(ctx);

	canvas.addEventListener('mousedown', function(e) {
		if (!enabled) {
			return;
		}
		if (!inPath) {
			inPath = true;
			if (animationRunning) {
				return;
			}
			let coords = grid.getTileForPoint(e.clientX - rect.left, e
				.clientY - rect.top);
			if (currentPath.length === 0 &&
				grid.grid[coords.col][coords.row].getType() != "ADD") {
				// Prevent arithmetic op tiles from being the first in the path.
				grid.clearHighlights(ctx);
				fidget(coords);
			} else if (maybeAddToPath(coords)) {
				grid.highlightTile(ctx, coords.col, coords.row);
			}
		}
	});
	canvas.addEventListener('mousemove', function(e) {
		if (!enabled) {
			return;
		}
		if (inPath) {
			if (animationRunning) {
				return;
			}
			let coords = grid.getTileForPoint(e.clientX - rect.left, e
				.clientY - rect.top);
			if (currentPath.length === 0 &&
				grid.grid[coords.col][coords.row].getType() != "ADD") {
				// Prevent arithmetic op tiles from being the first in the path.
				grid.clearHighlights(ctx);
				fidget(coords);
			} else if (maybeAddToPath(coords)) {
				grid.highlightTile(ctx, coords.col, coords.row);
			}
		}
	});
	document.addEventListener('mouseup', function(e) {
		if (!enabled) {
			return;
		}
		if (inPath) {
			inPath = false;
			if (animationRunning) {
				return;
			}
			if (currentSum == 0) {
				updatePoints();
				vanishFrame();
			} else {
				grid.clearHighlights(ctx);
				currentPath = [];
				currentSum = 0;
				updateCurrentPathSumText();
			}
		}
	});

	document.getElementById("start-game-btn").addEventListener('click',
		startGame);
	document.getElementById("play-again-btn").addEventListener('click',
		function() {
			// Reset grid before restarting.
			grid.init();
			grid.render(ctx);
			startGame();
		});
}