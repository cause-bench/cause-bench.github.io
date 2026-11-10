'use strict';

const $ = id => document.getElementById(id);
const modelNames = {
  hunyuan: 'HunyuanVideo-Foley', foleycrafter: 'FoleyCrafter', mmaudio: 'MMAudio',
  uniflow_audio: 'UniFlow-Audio', audiox_turbo: 'AudioX-Turbo'
};
const categoryNames = {
  dog_barking: 'Dog barking', frog_croaking: 'Frog croaking', cap_gun_shooting: 'Cap-gun shooting',
  baby_babbling_crying: 'Baby vocalizations', lions_roaring: 'Lion roaring',
  sharpen_knife: 'Knife sharpening', hammering: 'Hammering', chicken_crowing: 'Chicken crowing'
};
let manifest, players = [], activePlayer = null, selectedIndex = 0;

class PairPlayer {
  constructor(sample, model) {
    this.sample = sample;
    this.time = 0;
    this.playing = false;
    this.side = 0;
    this.version = 0;
    this.frame = 0;
    this.disposed = false;
    this.element = document.createElement('article');
    this.element.className = 'model-card';
    this.element.innerHTML = `
      <h3 class="model-title"></h3>
      <div class="video-pair"></div>
      <div class="timeline-controls">
        <button type="button" class="pair-play">Play pair</button>
        <button type="button" class="restart" aria-label="Restart this pair">↺</button>
        <div class="legend"><span class="target-label">● Target</span><span class="shared-label">● Shared</span></div>
        <output class="clock"></output>
      </div>
      <div class="timeline"><div class="segments"></div><span class="playhead"></span><input type="range" min="0" step="0.01" value="0"></div>
      <div class="windows"></div><p class="error" role="status" hidden></p>`;
    this.element.querySelector('h3').textContent = modelNames[model];
    this.videos = [];
    this.audios = [];
    this.overlays = [];
    this.buttons = [];
    ['positive', 'negative'].forEach((side, index) => {
      const figure = document.createElement('figure');
      figure.innerHTML = `<figcaption>${index ? 'V− · Counterfactual' : 'V+ · Factual'}</figcaption>
        <div class="video-stage"><video muted playsinline preload="metadata"></video>
        <button type="button" class="video-toggle"><span aria-hidden="true">▶</span></button>
        <span class="event" hidden></span></div><audio controls preload="metadata"></audio>`;
      const video = figure.querySelector('video');
      const audio = figure.querySelector('audio');
      const button = figure.querySelector('button');
      video.muted = true;
      video.src = sample.video[side];
      video.poster = sample.video[side].replace(/\.mp4$/, '.jpg');
      video.setAttribute('aria-label', `${modelNames[model]}, ${side} video`);
      button.setAttribute('aria-label', `Play ${modelNames[model]}, ${side}`);
      audio.src = 'demo-media/audio/' + sample.audio[model][side];
      audio.setAttribute('aria-label', `${modelNames[model]}, ${side} audio`);
      button.onclick = () => this.playing && this.side === index ? this.pause() : this.start(index);
      video.onvolumechange = () => { if (!video.muted) video.muted = true; };
      for (const media of [video, audio]) {
        media.onloadedmetadata = () => { media.pairSeekTime = Math.min(this.time, media.duration); media.currentTime = media.pairSeekTime; };
        media.onerror = () => this.fail('This media file could not load.');
      }
      audio.onplay = () => { if (!this.playing || this.side !== index) this.start(index); };
      audio.onpause = () => { if (this.playing && this.side === index && audio.paused) this.pause(); };
      audio.onseeking = () => {
        const assigned = audio.pairSeekTime;
        audio.pairSeekTime = null;
        if (assigned != null && Math.abs(audio.currentTime - assigned) < .03) return;
        if (Math.abs(audio.currentTime - this.time) > .03) {
          if (activePlayer && activePlayer !== this) activePlayer.pause();
          this.seek(audio.currentTime);
        }
      };
      audio.onended = () => { if (this.side === index) { this.pause(); this.seek(sample.scored_duration_seconds); } };
      this.videos.push(video); this.audios.push(audio); this.buttons.push(button);
      this.overlays.push(figure.querySelector('.event'));
      this.element.querySelector('.video-pair').append(figure);
    });
    this.slider = this.element.querySelector('input');
    this.slider.max = sample.scored_duration_seconds;
    this.slider.setAttribute('aria-label', `Seek ${modelNames[model]} pair`);
    this.slider.oninput = event => this.seek(Number(event.target.value));
    this.element.querySelector('.pair-play').onclick = () => this.playing ? this.pause() : this.start(this.side);
    this.element.querySelector('.restart').onclick = () => { this.pause(); this.seek(0); };
    const windows = [{interval:sample.target_interval, name:'Target', target:true},
      ...sample.shared_intervals.map((interval, i) => ({interval, name:`Shared ${i + 1}`}))];
    for (const {interval:[start,end], name, target} of windows) {
      const segment = document.createElement('span');
      segment.className = 'segment' + (target ? ' target' : '');
      segment.style.left = `${100 * start / sample.scored_duration_seconds}%`;
      segment.style.width = `${100 * (end - start) / sample.scored_duration_seconds}%`;
      this.element.querySelector('.segments').append(segment);
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = `${name} ${start.toFixed(2)}–${end.toFixed(2)} s`;
      button.onclick = () => this.seek(start);
      this.element.querySelector('.windows').append(button);
    }
    this.update();
  }

  pause() {
    this.playing = false;
    this.version++;
    cancelAnimationFrame(this.frame);
    [...this.videos, ...this.audios].forEach(media => media.pause());
    this.element.classList.remove('is-playing');
    this.element.querySelector('.pair-play').textContent = 'Play pair';
    this.buttons.forEach(button => button.firstElementChild.textContent = '▶');
  }

  seek(time) {
    this.time = Math.max(0, Math.min(time, this.sample.scored_duration_seconds));
    for (const media of [...this.videos, ...this.audios]) {
      if (media.readyState >= 1 && Math.abs(media.currentTime - this.time) > .015) {
        media.pairSeekTime = Math.min(this.time, media.duration);
        media.currentTime = media.pairSeekTime;
      }
    }
    this.update();
  }

  async start(side) {
    if (this.disposed) return;
    if (activePlayer && activePlayer !== this) activePlayer.pause();
    this.pause();
    this.side = side;
    activePlayer = this;
    if (this.time >= this.sample.scored_duration_seconds - .03) this.seek(0);
    else this.seek(this.time);
    this.playing = true;
    const version = this.version;
    this.element.querySelector('.error').hidden = true;
    this.element.classList.add('is-playing');
    this.element.querySelector('.pair-play').textContent = 'Pause';
    this.buttons[side].firstElementChild.textContent = 'Ⅱ';
    try {
      await Promise.all([...this.videos, this.audios[side]].map(media => media.play()));
      if (version !== this.version || this.disposed) return;
      this.frame = requestAnimationFrame(() => this.tick());
    } catch (error) {
      if (version === this.version && !this.disposed) this.fail('Playback could not start. Please try again.');
    }
  }

  tick() {
    if (!this.playing) return;
    const audio = this.audios[this.side];
    this.time = audio.currentTime;
    if (this.time >= this.sample.scored_duration_seconds - .01 || audio.ended) {
      this.pause(); this.seek(this.sample.scored_duration_seconds); return;
    }
    for (const video of this.videos) {
      if (video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - this.time) > .10) video.currentTime = this.time;
    }
    this.update();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  update() {
    const duration = this.sample.scored_duration_seconds;
    this.slider.value = this.time;
    this.element.querySelector('.playhead').style.left = `${100 * this.time / duration}%`;
    this.element.querySelector('.clock').textContent = `${this.time.toFixed(2)} / ${duration.toFixed(2)} s`;
    const target = this.time >= this.sample.target_interval[0] && this.time < this.sample.target_interval[1];
    const shared = this.sample.shared_intervals.some(([start,end]) => this.time >= start && this.time < end);
    this.overlays.forEach(overlay => {
      overlay.hidden = !target && !shared;
      overlay.className = 'event' + (target ? ' target' : '');
      overlay.textContent = target ? 'Target' : 'Shared';
    });
  }

  fail(message) {
    if (this.disposed) return;
    this.pause();
    const error = this.element.querySelector('.error');
    error.textContent = message; error.hidden = false;
  }

  dispose() {
    this.disposed = true;
    this.pause();
    for (const media of [...this.videos, ...this.audios]) {
      media.removeAttribute('src'); media.load();
    }
  }
}

function selectSample(index) {
  players.forEach(player => player.dispose());
  activePlayer = null;
  selectedIndex = index;
  const sample = manifest.samples[index];
  $('sample-select').value = index;
  $('sample-id').textContent = sample.sample_id;
  $('previous').disabled = index === 0;
  $('next').disabled = index === manifest.samples.length - 1;
  players = Object.keys(manifest.models).map(model => new PairPlayer(sample, model));
  $('models').replaceChildren(...players.map(player => player.element));
  const url = new URL(location.href); url.searchParams.set('sample', sample.sample_id);
  history.replaceState(null, '', url);
}

$('sample-select').onchange = event => selectSample(Number(event.target.value));
$('previous').onclick = () => selectSample(selectedIndex - 1);
$('next').onclick = () => selectSample(selectedIndex + 1);
window.addEventListener('pagehide', () => players.forEach(player => player.pause()));
fetch('data/demo.json').then(response => {
  if (!response.ok) throw new Error('Examples could not load.');
  return response.json();
}).then(data => {
  manifest = data;
  data.samples.forEach((sample, index) => {
    const option = document.createElement('option'); option.value = index;
    option.textContent = `${index + 1}. ${categoryNames[sample.category]}`;
    $('sample-select').append(option);
  });
  const requested = new URLSearchParams(location.search).get('sample');
  selectSample(Math.max(0, data.samples.findIndex(sample => sample.sample_id === requested)));
}).catch(error => { $('load-error').textContent = error.message; $('load-error').hidden = false; });

// Set the dataset download URL here when the archive is published.
const releases = { dataset: null };
for (const [key, url] of Object.entries(releases)) {
  if (!url) continue;
  const link = $(`${key}-link`); link.href = url;
  link.removeAttribute('aria-disabled'); link.removeAttribute('tabindex');
}
