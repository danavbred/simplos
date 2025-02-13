export class ParticleSystem {
    constructor() {
        this.particles = new Set();
        this.maxParticles = 50;
        this.characterSet = [
            ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            ...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω',
            ...'אבגדהוזחטיכלמנסעפצקרשת'
        ];
        this.pool = [];
        this.initializePool();
    }

    initializePool() {
        for (let i = 0; i < this.maxParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'letter-particle';
            this.pool.push(particle);
        }
    }

    initializeContainer(container) {
        if (!container) return;

        // Clear existing particle container
        const existingContainer = container.querySelector('.particle-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        // Create new particle container
        const particleContainer = document.createElement('div');
        particleContainer.className = 'particle-container';
        container.appendChild(particleContainer);

        // Start particle generation
        this.generateParticles(particleContainer);
        
        // Store interval ID for cleanup
        const intervalId = setInterval(() => {
            this.generateParticles(particleContainer);
        }, 1000);
        
        particleContainer.dataset.intervalId = intervalId.toString();
    }

    generateParticles(container) {
        if (!container || this.particles.size >= this.maxParticles) return;

        const particle = this.pool.pop();
        if (!particle) return;

        // Reset particle properties
        particle.style.opacity = '0';
        particle.textContent = this.characterSet[Math.floor(Math.random() * this.characterSet.length)];

        // Randomize particle properties
        const startX = Math.random() * container.clientWidth;
        const startY = Math.random() * container.clientHeight;
        const moveX = -100 + Math.random() * 200;
        const moveY = -100 + Math.random() * 200;
        const size = 12 + Math.random() * 16;
        const opacity = 0.2 + Math.random() * 0.3;
        const rotate = Math.random() * 180;
        const duration = 8 + Math.random() * 10;

        // Apply styles
        particle.style.cssText = `
            position: absolute;
            left: ${startX}px;
            top: ${startY}px;
            font-size: ${size}px;
            --moveX: ${moveX}px;
            --moveY: ${moveY}px;
            --opacity: ${opacity};
            --rotate: ${rotate}deg;
            animation: letterFloat ${duration}s ease-in-out forwards;
        `;

        container.appendChild(particle);
        this.particles.add(particle);

        // Remove particle after animation
        setTimeout(() => {
            if (container.contains(particle)) {
                container.removeChild(particle);
            }
            this.particles.delete(particle);
            this.pool.push(particle);
        }, duration * 1000);
    }

    cleanup(container) {
        const particleContainer = container.querySelector('.particle-container');
        if (particleContainer) {
            const intervalId = parseInt(particleContainer.dataset.intervalId);
            if (!isNaN(intervalId)) {
                clearInterval(intervalId);
            }
            particleContainer.remove();
        }
    }
}

export const particleSystem = new ParticleSystem();