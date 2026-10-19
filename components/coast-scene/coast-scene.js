Component({
  properties: {
    mood: { type: String, value: 'pending' },
    compact: { type: Boolean, value: false }
  },
  data: { tipVisible: false },
  lifetimes: { detached() { clearTimeout(this._tipTimer) } },
  methods: {
    greet() {
      if (this.properties.compact) return
      clearTimeout(this._tipTimer)
      this.setData({ tipVisible: true })
      this._tipTimer = setTimeout(() => this.setData({ tipVisible: false }), 3000)
    }
  }
})
