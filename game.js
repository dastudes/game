/**
 * The Legend of Mugard - Game Engine
 * A text adventure in the valley of Mugard
 */

class MugardGame {
  constructor() {
    this.gameData = null;
    this.state = null;
    this.outputEl = document.getElementById('output');
    this.inputEl = document.getElementById('player-input');
    this.submitBtn = document.getElementById('submit-btn');
    this.inventoryList = document.getElementById('inventory-list');
    this.inventoryPanel = document.getElementById('inventory-panel');
    this.mugardSound = document.getElementById('mugard-sound');
    
    this.gameStarted = false;
    this.eventQueue = [];
    this.currentEventIndex = 0;
    this.inEvent = false;
    
    this.init();
  }

  async init() {
    // Load game data
    try {
      const response = await fetch('gameData.json');
      this.gameData = await response.json();
      this.initState();
      this.bindEvents();
    } catch (error) {
      console.error('Failed to load game data:', error);
      this.print('Error loading game data. Please refresh the page.', 'error');
    }
  }

  initState() {
    // Create a working copy of the game state
    this.state = {
      player: { ...this.gameData.player },
      flags: { ...this.gameData.flags },
      rooms: JSON.parse(JSON.stringify(this.gameData.rooms)),
      characters: JSON.parse(JSON.stringify(this.gameData.characters)),
      objects: JSON.parse(JSON.stringify(this.gameData.objects))
    };
  }

  bindEvents() {
    this.submitBtn.addEventListener('click', () => this.handleInput());
    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleInput();
    });
  }

  handleInput() {
    const input = this.inputEl.value.trim();
    this.inputEl.value = '';

    if (!this.gameStarted) {
      this.startGame();
      return;
    }

    if (!input) return;

    // If we're in an event sequence, advance it
    if (this.inEvent) {
      this.advanceEvent();
      return;
    }

    // Echo player input
    this.printPlayerInput(input);

    // Parse and execute command
    const command = this.parse(input);
    this.execute(command);
  }

  startGame() {
    this.gameStarted = true;
    this.state.flags.gameStarted = true;
    this.outputEl.innerHTML = '';
    
    // Show the opening room
    this.showRoom(true);
  }

  // ==================== PARSER ====================
  
  parse(input) {
    const words = input.toLowerCase().trim().split(/\s+/);
    const vocab = this.gameData.vocabulary;
    
    // Remove articles
    const filtered = words.filter(w => !vocab.articles.includes(w));
    
    if (filtered.length === 0) {
      return { verb: null, noun: null, indirect: null, raw: input };
    }

    // Find verb
    let verb = null;
    let verbIndex = -1;
    
    for (let i = 0; i < filtered.length; i++) {
      for (const [verbKey, synonyms] of Object.entries(vocab.verbs)) {
        if (synonyms.includes(filtered[i])) {
          verb = verbKey;
          verbIndex = i;
          break;
        }
      }
      if (verb) break;
    }

    // Handle direction as verb (e.g., just typing "north")
    const directions = ['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'];
    if (!verb && directions.includes(filtered[0])) {
      verb = 'go';
      verbIndex = -1; // No verb word to skip
    }

    // Get remaining words as noun phrase
    const remaining = verbIndex >= 0 ? filtered.slice(verbIndex + 1) : filtered;
    
    // Remove prepositions to find noun
    const nounWords = remaining.filter(w => !vocab.prepositions.includes(w));
    const noun = nounWords.length > 0 ? nounWords.join(' ') : null;

    return { verb, noun, indirect: null, raw: input };
  }

  // ==================== COMMAND EXECUTION ====================

  execute(command) {
    const { verb, noun } = command;

    if (!verb) {
      this.print("I don't understand. Type <strong>help</strong> for a list of commands.", 'error');
      return;
    }

    switch (verb) {
      case 'go':
      case 'north':
      case 'south':
      case 'east':
      case 'west':
        this.doGo(verb === 'go' ? noun : verb);
        break;
      case 'look':
        this.doLook(noun);
        break;
      case 'take':
        this.doTake(noun);
        break;
      case 'drop':
        this.doDrop(noun);
        break;
      case 'inventory':
        this.doInventory();
        break;
      case 'talk':
        this.doTalk(noun);
        break;
      case 'use':
        this.doUse(noun);
        break;
      case 'help':
        this.doHelp();
        break;
      default:
        this.print("I don't know how to do that.", 'error');
    }
  }

  doGo(direction) {
    // Normalize direction
    const dirMap = { 'n': 'north', 's': 'south', 'e': 'east', 'w': 'west' };
    direction = dirMap[direction] || direction;

    const currentRoom = this.state.rooms[this.state.player.location];
    
    if (!direction) {
      this.print("Which direction? Try <strong>north</strong>, <strong>south</strong>, <strong>east</strong>, or <strong>west</strong>.", 'error');
      return;
    }

    if (!currentRoom.exits[direction]) {
      this.print("You can't go that way.", 'narration');
      return;
    }

    const newRoomId = currentRoom.exits[direction];
    this.state.player.location = newRoomId;
    this.showRoom(true);
  }

  doLook(noun) {
    if (!noun) {
      // Look at the room
      this.showRoom(false);
      return;
    }

    // Look at a specific thing
    const target = this.findTarget(noun);
    
    if (target) {
      if (target.type === 'object') {
        this.print(target.item.description, 'narration');
        if (target.item.onExamine) {
          this.print(target.item.onExamine, 'narration');
        }
      } else if (target.type === 'character') {
        this.print(target.item.description, 'narration');
      }
    } else {
      this.print("You don't see that here.", 'error');
    }
  }

  doTake(noun) {
    if (!noun) {
      this.print("Take what?", 'error');
      return;
    }

    const target = this.findTarget(noun);
    
    if (!target || target.type !== 'object') {
      this.print("You don't see that here.", 'error');
      return;
    }

    if (!target.item.canTake) {
      this.print("You can't take that.", 'narration');
      return;
    }

    // Add to inventory
    this.state.player.inventory.push(target.item.id);
    target.item.location = 'inventory';
    
    // Remove from room
    const room = this.state.rooms[this.state.player.location];
    room.objects = room.objects.filter(id => id !== target.item.id);

    if (target.item.onTake) {
      this.print(target.item.onTake, 'narration');
    } else {
      this.print(`You take the ${target.item.name}.`, 'narration');
    }

    this.updateInventoryDisplay();
  }

  doDrop(noun) {
    if (!noun) {
      this.print("Drop what?", 'error');
      return;
    }

    const itemId = this.findInInventory(noun);
    
    if (!itemId) {
      this.print("You're not carrying that.", 'error');
      return;
    }

    const item = this.state.objects[itemId];
    
    // Remove from inventory
    this.state.player.inventory = this.state.player.inventory.filter(id => id !== itemId);
    
    // Add to room
    const room = this.state.rooms[this.state.player.location];
    room.objects.push(itemId);
    item.location = this.state.player.location;

    this.print(`You drop the ${item.name}.`, 'narration');
    this.updateInventoryDisplay();
  }

  doInventory() {
    const inv = this.state.player.inventory;
    
    if (inv.length === 0) {
      this.print("You're not carrying anything.", 'narration');
      return;
    }

    const items = inv.map(id => this.state.objects[id].name).join(', ');
    this.print(`You are carrying: ${items}`, 'narration');
    
    // Also show the inventory panel briefly
    this.inventoryPanel.classList.add('show');
    setTimeout(() => {
      this.inventoryPanel.classList.remove('show');
    }, 3000);
  }

  doTalk(noun) {
    if (!noun) {
      this.print("Talk to whom?", 'error');
      return;
    }

    const target = this.findTarget(noun);
    
    if (!target || target.type !== 'character') {
      this.print("You don't see anyone like that here.", 'error');
      return;
    }

    const character = target.item;
    const dialogue = this.getDialogue(character);
    
    this.printDialogue(character.name, dialogue, character.language);
  }

  doUse(noun) {
    if (!noun) {
      this.print("Use what?", 'error');
      return;
    }

    // For now, generic response
    this.print("You're not sure how to use that right now.", 'narration');
  }

  doHelp() {
    const help = `
      <div class="room-title">Available Commands</div>
      <p><strong>Movement:</strong> go north, south, east, west (or just n, s, e, w)</p>
      <p><strong>Look:</strong> look (examine room) or look at [something]</p>
      <p><strong>Take:</strong> take [object] or get [object]</p>
      <p><strong>Drop:</strong> drop [object]</p>
      <p><strong>Inventory:</strong> inventory or i (see what you're carrying)</p>
      <p><strong>Talk:</strong> talk to [character]</p>
      <p><strong>Help:</strong> help (this list)</p>
    `;
    this.print(help, 'narration');
  }

  // ==================== ROOM DISPLAY ====================

  showRoom(isNewRoom) {
    const room = this.state.rooms[this.state.player.location];
    
    // Room name
    this.print(`<div class="room-title">${room.name}</div>`, 'narration');

    // First visit text or regular description
    if (room.firstVisit && room.onFirstVisit) {
      this.print(room.onFirstVisit, 'narration');
      room.firstVisit = false;
      
      // Set visit flag
      const flagName = `visited${this.capitalize(room.id)}`;
      if (this.state.flags.hasOwnProperty(flagName)) {
        this.state.flags[flagName] = true;
      }
    } else {
      this.print(room.description, 'narration');
    }

    // Objects in room
    const roomObjects = room.objects.map(id => this.state.objects[id]).filter(Boolean);
    if (roomObjects.length > 0 && isNewRoom) {
      const objNames = roomObjects.map(o => o.name);
      if (objNames.length === 1) {
        this.print(`You notice a ${objNames[0]} here.`, 'narration');
      } else {
        this.print(`You notice: ${objNames.join(', ')}.`, 'narration');
      }
    }

    // Characters in room
    const roomChars = room.characters.map(id => this.state.characters[id]).filter(Boolean);
    if (roomChars.length > 0 && isNewRoom) {
      for (const char of roomChars) {
        this.print(char.dialogue.default || `${char.name} is here.`, 'narration');
      }
    }

    // Exits
    const exits = Object.keys(room.exits);
    if (exits.length > 0) {
      this.print(`<div class="exits">Exits: <span>${exits.join(', ')}</span></div>`, 'narration');
    }

    // Trigger event if any
    if (room.triggersEvent && room.firstVisit === false) {
      this.triggerEvent(room.triggersEvent);
      room.triggersEvent = null; // Only trigger once
    }
  }

  // ==================== EVENT SYSTEM ====================

  triggerEvent(eventId) {
    const event = this.gameData.events[eventId];
    if (!event) return;

    this.inEvent = true;
    this.eventQueue = event.sequence;
    this.currentEventIndex = 0;

    // Small delay before starting
    setTimeout(() => {
      this.advanceEvent();
    }, 500);
  }

  advanceEvent() {
    if (this.currentEventIndex >= this.eventQueue.length) {
      this.endEvent();
      return;
    }

    const step = this.eventQueue[this.currentEventIndex];
    this.currentEventIndex++;

    switch (step.type) {
      case 'narration':
        this.print(step.text, 'narration');
        break;
      case 'dialogue':
        const char = this.state.characters[step.character];
        this.printDialogue(char.name, step.text, step.language);
        break;
    }

    // Check if there are more steps
    if (this.currentEventIndex < this.eventQueue.length) {
      this.print('<em class="continue-prompt">(Press Enter to continue...)</em>', 'narration');
    } else {
      this.endEvent();
    }
  }

  endEvent() {
    this.inEvent = false;
    this.eventQueue = [];
    this.currentEventIndex = 0;

    // Find the current event and apply its effects
    // For simplicity, we'll check which event just ended based on flags
    // In a more robust system, we'd track this better
    
    // For now, just check if we need to continue to revelation
    if (this.state.flags.partyStarted && !this.state.flags.revelationHeard) {
      setTimeout(() => {
        this.triggerEvent('revelation');
      }, 500);
    }
  }

  // ==================== HELPERS ====================

  findTarget(noun) {
    const room = this.state.rooms[this.state.player.location];
    
    // Check objects in room
    for (const objId of room.objects) {
      const obj = this.state.objects[objId];
      if (obj && this.matchesNoun(obj.name, noun)) {
        return { type: 'object', item: obj };
      }
    }

    // Check objects in inventory
    for (const objId of this.state.player.inventory) {
      const obj = this.state.objects[objId];
      if (obj && this.matchesNoun(obj.name, noun)) {
        return { type: 'object', item: obj };
      }
    }

    // Check characters in room
    for (const charId of room.characters) {
      const char = this.state.characters[charId];
      if (char && this.matchesNoun(char.name, noun)) {
        return { type: 'character', item: char };
      }
    }

    return null;
  }

  findInInventory(noun) {
    for (const objId of this.state.player.inventory) {
      const obj = this.state.objects[objId];
      if (obj && this.matchesNoun(obj.name, noun)) {
        return objId;
      }
    }
    return null;
  }

  matchesNoun(name, noun) {
    const nameLower = name.toLowerCase();
    const nounLower = noun.toLowerCase();
    
    // Exact match
    if (nameLower === nounLower) return true;
    
    // Partial match (noun appears in name)
    if (nameLower.includes(nounLower)) return true;
    
    // Match individual words
    const nameWords = nameLower.split(/\s+/);
    if (nameWords.includes(nounLower)) return true;
    
    return false;
  }

  getDialogue(character) {
    // Return appropriate dialogue based on game state
    if (this.state.flags.partyStarted && character.dialogue.party) {
      return character.dialogue.party;
    }
    return character.dialogue.default;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  updateInventoryDisplay() {
    const inv = this.state.player.inventory;
    
    if (inv.length === 0) {
      this.inventoryList.innerHTML = '<li><em>Nothing yet</em></li>';
    } else {
      this.inventoryList.innerHTML = inv
        .map(id => `<li>${this.state.objects[id].name}</li>`)
        .join('');
    }
  }

  // ==================== OUTPUT ====================

  print(text, type = 'narration') {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = text;
    this.outputEl.appendChild(div);
    this.scrollToBottom();
  }

  printPlayerInput(text) {
    const div = document.createElement('div');
    div.className = 'player-input-echo';
    div.textContent = text;
    this.outputEl.appendChild(div);
  }

  printDialogue(speaker, text, language = 'mugard') {
    const div = document.createElement('div');
    div.className = `message dialogue ${language}`;
    
    let indicator = '';
    if (language === 'mugard') {
      indicator = '<span class="mugard-indicator"></span>';
      this.playMugardSound();
    }
    
    div.innerHTML = `${indicator}<span class="speaker">${speaker}:</span> "${text}"`;
    this.outputEl.appendChild(div);
    this.scrollToBottom();
  }

  playMugardSound() {
    // If we have an audio source loaded, play it
    if (this.mugardSound.src) {
      this.mugardSound.currentTime = 0;
      this.mugardSound.play().catch(() => {
        // Audio play failed, possibly due to browser autoplay policy
        // This is fine, we'll just skip the sound
      });
    }
  }

  scrollToBottom() {
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }
}

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
  window.game = new MugardGame();
});
