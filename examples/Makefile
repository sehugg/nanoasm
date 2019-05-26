
all: fib8.hex racing8.hex game16.hex

clean:
	rm -f *.hex

%8.hex: %8.asm
	node ../src/asmmain.js femto8.json $< > $@

%16.hex: %16.asm
	node ../src/asmmain.js femto16.json $< > $@

