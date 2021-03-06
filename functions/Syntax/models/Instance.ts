import { Configuration } from '@core/main-process';
const beautify = require('js-beautify').html;
import Variable from './Variable';
import Constant from './Constant';
import Vector from './Vector';
import Error from './Error';
import * as find from '@instances/find';
import * as layouts from '@feno/layouts';
import * as utils from '../utils';

interface InstanceBody {
    structure: string,
    inline: boolean,
    filename: string
}

export default class Instance {
    
    public content:string = "";
    inline:boolean = false;
    structure:string = "";
    filename: string = "";
    
    constructor(body:InstanceBody) {
        this.inline = body.inline;
        this.structure = body.structure;
        this.filename = body.filename;
        this.getInstance(body.structure)
        this.structure = utils.basicFunctions(this.structure);
    }
    
    public getInstance(code: string): void {
        code = code.split(/\bnew Feno ?\({/).pop().split(/}\)/)[0];
        /** Check if Feno Class has content */
        if (code && code.length && !/^\s*$/.test(code)) {
            this.content = code;
        } else {
            new Error({
                text: 'Feno class was declared without reason!',
                at: `/pages/${this.filename}.feno`,
                solution: `You must declare the Feno class only if you're going to use it`,
                info: `https://fenolang.herokuapp.com/docs/feno_class`
            })
        }
    }

    public async layouts(config: Configuration) {
        return new Promise(async (resolve, reject) => {
            // If the instance has a layout declared
            if (/this\.layout ?= ?"(.*?)",?/.test(this.content)) {
                let layout_name: string = this.content.match(/this\.layout ?= ?"(.*?)",?/)[1];
                // If the layout property is not empty
                if (layout_name && layout_name.length) {
                    let layouts_instance = new layouts.Transpilation({
                        code: this.structure,
                        layout: layout_name,
                        filename: this.filename
                    })
                    await layouts_instance.getResponse(config)
                    this.structure = layouts_instance.res;
                    resolve();
                } else {
                    new Error({
                        text: 'Layout property has no content!',
                        at: `/pages/${this.filename}.feno`,
                        solution: "You should call a layout inside the layout property.",
                        info: `https://fenolang.herokuapp.com/docs/layouts`
                    })
                }
            } else {
                resolve();
            }
        })
    }

    private applyVariables(variable: string): void {
        // Set slots
        let regex = new RegExp(`{{ ?${variable} ?}}`,'g')
        this.structure = this.structure.replace(regex, `<slot name="${variable}"></slot>`)
        let apply_code = `document.querySelector('[name="${variable}"]').innerHTML = ${variable};`

        // Set apply code
        this.structure = this.structure.replace(/new Feno ?\({([\s\S]*?)}\)/, `new Feno({$1\t${apply_code}\n})`);
    }
    
    public strings(): void {
        if (find.variable(this.structure)) {
            let lines: string[] = this.content.split(/\n/);
            new Promise((resolve,reject) => {
                lines.forEach(async line => {
                    // Si la línea tiene una declaración de variable
                    if (find.variable(line)) {
                        let variable = new Variable({
                            var: line.match(/def (String|Number|Boolean|Array|Object|Any) (.*?) ?= ?(.*?|[\s\S]*?);/)[0],
                            filename: this.filename
                        })
                        if (variable.checkType() && variable.checkAssignmentTypes(this.content)) {
                            this.structure = variable.transpile(this.structure);
                            this.applyVariables(variable.variable_name);
                        }
                    }
                })
                resolve(this.structure);
            })
        }
    }

    public constants(): void {
        if (find.constant(this.structure)) {
            let lines: string[] = this.content.split(/\n/);
            new Promise((resolve, reject) => {
                lines.forEach(async line => {
                    if (find.constant(line)) {
                        let constant = new Constant({
                            var: line.match(/const (String|Number|Boolean|Array|Object|Any) (.*?) ?= ?(.*?|[\s\S]*?);/)[0],
                            filename: this.filename
                        })
                        if (constant.checkType() && constant.checkNoAssignaments(this.content)) {
                            this.structure = constant.transpile(this.structure);
                            this.applyVariables(constant.variable_name);
                        }
                    }
                })
                resolve(this.structure);
            })
        }
    }

    public async vectors() {
        return new Promise((resolve, reject) => {
            // # Find a vector
            if (find.vector(this.structure)) {
                let vector_matches = this.structure.match(/declare Vector .*?:[\s\S]*?}/g);
                // For every vector
                vector_matches.forEach(async vector_match => {
                    let vector = new Vector(vector_match, this.filename);
                    // # Transpile code of vector
                    await vector.transpile(this.structure);
                    this.structure = vector.result;
                    // # Transpile code of vector properties
                    this.structure = utils.basicFunctions(this.structure);
                })
                resolve();
            } else {
                resolve();
            }
        })
    }
    
    public destroy(): void {
        // this.structure = this.structure.split(/new Feno ?\({[\s\S]*}\)/).join('');
        this.structure = this.structure.replace(/new Feno ?\({([\s\S]*?)}\)/, `<script>$1</script>`);
    }

    public getContent(): string {
        this.structure = beautify(this.structure);
        return this.structure;
    }
    
}