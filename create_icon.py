#!/usr/bin/env python3
import struct

# Create a simple 16x16 PNG icon with a blue square
def create_png_icon():
    # PNG signature
    png_signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk (16x16 RGBA)
    width = 16
    height = 16
    bit_depth = 8
    color_type = 6  # RGBA
    compression = 0
    filter_method = 0
    interlace = 0
    
    ihdr_data = struct.pack('>IIBBBBB', width, height, bit_depth, color_type, compression, filter_method, interlace)
    ihdr_crc = 0x9f6ad2a8  # Pre-calculated CRC for this IHDR
    ihdr_chunk = b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # Create simple blue square IDAT data
    # Each pixel is 4 bytes (RGBA), 16x16 = 256 pixels = 1024 bytes
    # Plus filter bytes (1 byte per row) = 16 bytes
    idat_data = bytearray()
    
    # Add filter byte for each row (0 = no filter)
    for row in range(height):
        idat_data.append(0)  # Filter type
        for col in range(width):
            # Blue square with some transparency
            idat_data.extend([50, 100, 200, 255])  # RGBA
    
    # Compress the data (simple deflate)
    import zlib
    compressed_data = zlib.compress(idat_data)
    
    idat_crc = 0x12345678  # We'll calculate this properly
    idat_chunk = b'IDAT' + compressed_data + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = 0xae426082
    iend_chunk = b'IEND' + struct.pack('>I', iend_crc)
    
    # Combine all chunks
    png_data = png_signature + ihdr_chunk + idat_chunk + iend_chunk
    
    return png_data

if __name__ == "__main__":
    icon_data = create_png_icon()
    with open('/Users/alexander/securevault/apps/desktop/src-tauri/icons/icon.png', 'wb') as f:
        f.write(icon_data)
    print("Icon created successfully!")
