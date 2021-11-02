import vm from 'vm'

export default class CallbackDataAgent {
  private _template: string
  private _regex = /`/gm

  private _escape(template: string) {
    return `\`${template.replace(this._regex, '\\`')}\``
  }

  constructor(template: string, ) {
    this._template = template
  }

  regex() {
    // Replaces all occurencies of ${whatever} in template with supplied parameter
    const preparedString = this._template
      .replace(/\$\{\w+\}/g, '(.+)')
      .replace(/\|/g, '\\|')
    // console.log('preparedString: ', preparedString)
    const r = new RegExp(`^${preparedString}$`)
    // console.log('regex: ', r)
    return r
  }

  template(context: { [key: string]: string | number } = {}) {
    const options = { timeout: 300 }
    const script = new vm.Script(this._escape(this._template))
    try {
      return script.runInNewContext(
        Object.assign({}, context),
        options
      )
    } catch (err) {
      throw new Error(`Failed to compile template: ${err.message}`)
    }
  }
}
