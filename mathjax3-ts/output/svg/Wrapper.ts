/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements the SVGWrapper class
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

import {PropertyList} from '../../core/Tree/Node.js';
import {MmlNode, TextNode, AbstractMmlNode, AttributeList, indentAttributes} from '../../core/MmlTree/MmlNode.js';
import {OptionList} from '../../util/Options.js';
import * as LENGTHS from '../../util/lengths.js';
import {CommonWrapper, CommonWrapperClass, Constructor, StringMap} from '../common/Wrapper.js';
import {SVG} from '../svg.js';
import {SVGWrapperFactory} from './WrapperFactory.js';
import {SVGmo} from './Wrappers/mo.js';
import {BBox} from './BBox.js';
import {StyleList} from '../common/CssStyles.js';

export {Constructor, StringMap} from '../common/Wrapper.js';


/*****************************************************************/

/**
 * Needed to access node.style[id] using variable id
 */
interface CSSStyle extends CSSStyleDeclaration {
    [id: string]: string | Function | number | CSSRule;
}

/**
 * Shorthand for makeing a SVGWrapper constructor
 */
export type SVGConstructor<N, T, D> = Constructor<SVGWrapper<N, T, D>>;


/*****************************************************************/
/**
 *  The type of the SVGWrapper class (used when creating the wrapper factory for this class)
 */
export interface SVGWrapperClass<N, T, D> extends CommonWrapperClass<any, any, any> {

    kind: string;

    /**
     *  The default styles for SVG
     */
    styles: StyleList;
}

/*****************************************************************/
/**
 *  The base SVGWrapper class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
export class SVGWrapper<N, T, D> extends
CommonWrapper<SVG<N, T, D>, SVGWrapper<N, T, D>, SVGWrapperClass<N, T, D>> {

    public static kind: string = 'unknown';

    /**
     * If true, this causes a style for the node type to be generated automatically
     * that sets display:inline-block (as needed for the output for MmlNodes).
     */
    public static autoStyle = true;

    /**
     *  The default styles for SVG
     */
    public static styles: StyleList = {
        'mjx-container[jax="SVG"] > svg a': {
            fill: 'blue', stroke: 'blue'
        }
    };

    /**
     * The factory used to create more SVGWrappers
     */
    protected factory: SVGWrapperFactory<N, T, D>;

    /**
     * The parent and children of this node
     */
    public parent: SVGWrapper<N, T, D>;
    public childNodes: SVGWrapper<N, T, D>[];

    /**
     * The SVG element generated for this wrapped node
     */
    public element: N = null;

    /*******************************************************************/

    /**
     * Create the HTML for the wrapped node.
     *
     * @param {N} parent  The HTML node where the output is added
     */
    public toSVG(parent: N) {
        this.addChildren(this.standardSVGnode(parent));
    }

    /**
     * @param {N} parent  The element in which to add the children
     */
    public addChildren(parent: N) {
        let x = 0;
        for (const child of this.childNodes) {
            child.toSVG(parent);
            if (child.element) {
                child.place(x + child.bbox.L * child.bbox.rscale, 0);
            }
            x += (child.bbox.L + child.bbox.w + child.bbox.R) * child.bbox.rscale;
        }
    }

    /*******************************************************************/

    /**
     * Create the standard SVG element for the given wrapped node.
     *
     * @param {N} parent  The HTML element in which the node is to be created
     * @returns {N}  The root of the HTML tree for the wrapped node's output
     */
    protected standardSVGnode(parent: N) {
        const svg = this.createSVGnode(parent);
        this.handleStyles();
        this.handleScale();
        this.handleColor();
        this.handleAttributes();
        return svg;
    }

    /**
     * @param {N} parent  The HTML element in which the node is to be created
     * @returns {N}  The root of the HTML tree for the wrapped node's output
     */
    protected createSVGnode(parent: N) {
        const href = this.node.attributes.get('href');
        if (href) {
            parent = this.adaptor.append(parent, this.svg('a', {href: href})) as N;
            const {h, d, w} = this.getBBox();
            this.adaptor.append(parent, this.svg('rect', {
                'data-hitbox': true, fill: 'none', stroke: 'none', 'pointer-events': 'all',
                width: this.fixed(w), height: this.fixed(h + d), y: this.fixed(-d)
            }));
        }
        this.element = this.adaptor.append(parent, this.svg('g', {'data-mml-node': this.node.kind})) as N;
        return this.element;
    }

    /**
     * Set the CSS styles for the svg element
     */
    protected handleStyles() {
        if (!this.styles) return;
        const styles = this.styles.cssText;
        if (styles) {
            this.adaptor.setAttribute(this.element, 'style', styles);
        }
    }

    /**
     * Set the (relative) scaling factor for the node
     */
    protected handleScale() {
        if (this.bbox.rscale !== 1) {
            var scale = 'scale(' + this.fixed(this.bbox.rscale/1000, 3) + ')';
            this.adaptor.setAttribute(this.element, 'transform', scale);
        }
    }

    /**
     * Add the foreground and background colors
     * (Only look at explicit attributes, since inherited ones will
     *  be applied to a parent element, and we will inherit from that)
     */
    protected handleColor() {
        const adaptor = this.adaptor;
        const attributes = this.node.attributes;
        const mathcolor = attributes.getExplicit('mathcolor') as string;
        const color = attributes.getExplicit('color') as string;
        const mathbackground = attributes.getExplicit('mathbackground') as string;
        const background = attributes.getExplicit('background') as string;
        if (mathcolor || color) {
            adaptor.setAttribute(this.element, 'fill', mathcolor || color);
            adaptor.setAttribute(this.element, 'stroke', mathcolor || color);
        }
        if (mathbackground || background) {
            let {h, d, w} = this.getBBox();
            let rect = this.svg('rect', {
                fill: mathbackground || background,
                x: 0, y: this.fixed(-d),
                width: this.fixed(w),
                height: this.fixed(h + d),
                'data-bgcolor': true
            });
            let child = adaptor.firstChild(this.element);
            if (child) {
                adaptor.insert(rect, child);
            } else {
                adaptor.append(this.element, rect);
            }
        }
    }

    /**
     * Copy RDFa, aria, and other tags from the MathML to the SVG output nodes.
     * Don't copy those in the skipAttributes list, or anything that already exists
     * as a property of the node (e.g., no "onlick", etc.).  If a name in the
     * skipAttributes object is set to false, then the attribute WILL be copied.
     * Add the class to any other classes already in use.
     */
    protected handleAttributes() {
        const attributes = this.node.attributes;
        const defaults = attributes.getAllDefaults();
        const skip = SVGWrapper.skipAttributes;
        for (const name of attributes.getExplicitNames()) {
            if (skip[name] === false || (!(name in defaults) && !skip[name] &&
                                         !this.adaptor.hasAttribute(this.element, name))) {
                this.adaptor.setAttribute(this.element, name, attributes.getExplicit(name) as string);
            }
        }
        if (attributes.get('class')) {
            this.adaptor.addClass(this.element, attributes.get('class') as string);
        }
    }

    /*******************************************************************/

    /**
     * @param {N} svg         The HTML node whose indentation is to be adjusted
     * @param {string} align  The alignment for the node
     * @param {number} shift  The indent (positive or negative) for the node
     */
    protected setIndent(svg: N, align: string, shift: number) {
        if (align === 'center' || align === 'left') {
            // FIXME
        }
        if (align === 'center' || align === 'right') {
            // FIXME
        }
    }

    /**
     * @param {number} x   The x-offset for the element
     * @param {number} y   The y-offset for the element
     * @param {N} eleemnt  The element to be placed
     */
    public place(x: number, y: number, element: N = null) {
        if (!element) {
            element = this.element;
        }
        if (x || y) {
            let transform = this.adaptor.getAttribute(element, 'transform') || '';
            transform = 'translate(' + this.fixed(x) + ', ' + this.fixed(y) + ')'
                      + (transform ? ' ' + transform : '');
            this.adaptor.setAttribute(element, 'transform', transform);
        }
    }

    /**
     * @param {number} n        The character number
     * @param {number} x        The x-position of the character
     * @param {number} y        The y-position of the character
     * @param {N}               The container for the character
     * @param {string} variant  The variant to use for the character
     * @return {number}         The width of the character
     */
    public placeChar(n: number, x: number, y: number, parent: N, variant: string = null) {
        if (variant === null) {
            variant = this.variant;
        }
        const C = n.toString(16).toUpperCase();
        const [h, d, w, data] = this.getVariantChar(variant, n);
        if ('p' in data) {
            this.place(x, y, this.adaptor.append(parent, this.svg('path', {
                'data-c': C, d: (data.p ? 'M' + data.p + 'Z' : '')
            })));
        } else if ('c' in data) {
            const g = this.adaptor.append(parent, this.svg('g', {'data-c': C}));
            this.place(x, y, g);
            x = 0;
            for (const n of this.unicodeChars(data.c)) {
                x += this.placeChar(n, x, y, g, variant);
            }
        } else if (data.unknown) {
            const char = String.fromCharCode(n);
            const text = this.adaptor.append(parent, this.jax.unknownText(char, variant));
            this.place(x, y, text);
            return this.jax.measureTextNodeWithCache(text, char, variant).w;
        }
        return w;
    }

    /**
     * @param {number} W       The total width
     * @param {number} w       The width to be aligned
     * @param {string} align   How to align (left, center, right)
     * @return {number}        The x position of the aligned width
     */
    protected getAlignX(W: number, w: number, align: string) {
        if (align === 'right') return W - w ;
        if (align === 'left') return 0;
        return (W - w) / 2;
    }

    /**
     * @param {number} H        The total height
     * @param {number} D        The total depth
     * @param {number} h        The height to be aligned
     * @param {number} d        The depth to be aligned
     * @param {string} align    How to align (top, bottom, middle, axis, baseline)
     * @return {number}         The y position of the aligned baseline
     */
    protected getAlignY(H: number, D: number, h: number, d: number, align: string) {
        if (align === 'top') return H - h ;
        if (align === 'bottom') return d - D;
        if (align === 'middle') return ((H - h) - (D - d)) / 2;
        return 0; // baseline and axis
    }

    /*******************************************************************/
    /**
     * For debugging
     */

    public drawBBox() {
        let {w, h, d}  = this.getBBox();
        const box = this.svg('g', {style: {
            opacity: .25
        }}, [
            this.svg('rect', {
                fill: 'red',
                height: this.fixed(h),
                width: this.fixed(w)
            }),
            this.svg('rect', {
                fill: 'green',
                height: this.fixed(d),
                width: this.fixed(w),
                y: this.fixed(-d)
            })
        ] as N[]);
        const node = this.element || this.parent.element;
        this.adaptor.append(node, box);
    }

    /*******************************************************************/
    /*
     * Easy access to some utility routines
     */

    /**
     * @param {string} type      The tag name of the HTML node to be created
     * @param {OptionList} def   The properties to set for the created node
     * @param {(N|T)[]} content  The child nodes for the created HTML node
     * @return {N}               The generated HTML tree
     */
    public html(type: string, def: OptionList = {}, content: (N|T)[] = []) {
        return this.jax.html(type, def, content);
    }

    /**
     * @param {string} type      The tag name of the svg node to be created
     * @param {OptionList} def   The properties to set for the created node
     * @param {(N|T)[]} content  The child nodes for the created SVG node
     * @return {N}               The generated SVG tree
     */
    public svg(type: string, def: OptionList = {}, content: (N| T)[] = []) {
        return this.jax.svg(type, def, content);
    }

    /**
     * @param {string} text  The text from which to create an HTML text node
     * @return {T}  The generated text node with the given text
     */
    public text(text: string) {
        return this.jax.text(text);
    }

    /**
     * @override
     */
    protected createMo(text: string): SVGmo<N, T, D> {
        return super.createMo(text) as any as SVGmo<N, T, D>;
    }

    /**
     * @override
     */
    public coreMO(): SVGmo<N, T, D> {
        return super.coreMO() as any as SVGmo<N, T, D>;
    }

    /**
     * @param {number} x   The dimension to display
     * @param {number} n   The number of digits to disoplay
     * @return {string}    The dimension with the given nuber of digits (minus trailing zeros)
     */
    public fixed(x: number, n: number = 1) {
        return this.jax.fixed(x * 1000, n);
    }

}